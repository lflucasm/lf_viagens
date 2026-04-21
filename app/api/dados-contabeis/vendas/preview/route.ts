// app/api/dados-contabeis/vendas/route.ts (PREVIEW JSON)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  balcaoProfitSemTaxaCents,
  buildTaxRule,
  netProfitAfterTaxCents,
  recifeDateISO,
  resolveTaxPercent,
  taxFromProfitCents,
} from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function nextMonthStart(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  let y = Number(yStr);
  let m = Number(mStr);
  if (!y || !m) return "";
  m += 1;
  if (m === 13) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function addDaysISO(iso: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoToUTCDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d)); // 00:00Z
}

function isoDateOnlyUTC(d: Date) {
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function cleanDoc(v: string) {
  return String(v || "").replace(/\D+/g, "");
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function recifeStartDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00-03:00`);
}

async function computeBalcaoNetProfitCents(
  team: string,
  startDateISO: string,
  endExclusiveISO: string
) {
  const settings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: { taxPercent: true, taxEffectiveFrom: true },
  });
  const taxRule = buildTaxRule(settings);

  const rangeStart = recifeStartDate(startDateISO);
  const rangeEnd = recifeStartDate(endExclusiveISO);

  const rows = await prisma.balcaoOperacao.findMany({
    where: {
      team,
      createdAt: { gte: rangeStart, lt: rangeEnd },
    },
    select: {
      createdAt: true,
      customerChargeCents: true,
      supplierPayCents: true,
      boardingFeeCents: true,
    },
  });

  let totalNet = 0;
  for (const row of rows) {
    const gross = balcaoProfitSemTaxaCents({
      customerChargeCents: row.customerChargeCents,
      supplierPayCents: row.supplierPayCents,
      boardingFeeCents: row.boardingFeeCents,
    });
    const taxPercent = resolveTaxPercent(recifeDateISO(row.createdAt), taxRule);
    const taxCents = taxFromProfitCents(gross, taxPercent);
    totalNet += netProfitAfterTaxCents(gross, taxCents);
  }

  return totalNet;
}

/**
 * Rateio proporcional (somente quando totalProfitCents > 0).
 * Se lucro tributável for 0, todo mundo recebe 0.
 */
function splitProfitProportional(
  items: Array<{ key: string; totalCents: number }>,
  totalProfitCents: number
) {
  const total = items.reduce((a, x) => a + (x.totalCents || 0), 0);
  if (total <= 0 || totalProfitCents <= 0) {
    return new Map(items.map((i) => [i.key, 0]));
  }

  const tmp = items.map((i) => {
    const raw = (i.totalCents / total) * totalProfitCents;
    return { key: i.key, raw, floor: Math.floor(raw) };
  });

  const allocated = tmp.reduce((a, x) => a + x.floor, 0);
  let remaining = totalProfitCents - allocated;

  tmp.sort((a, b) => (b.raw - b.floor) - (a.raw - a.floor));

  const out = new Map<string, number>();
  for (let i = 0; i < tmp.length; i++) {
    const add = remaining > 0 ? 1 : 0;
    out.set(tmp[i].key, tmp[i].floor + add);
    if (remaining > 0) remaining -= 1;
  }
  return out;
}

// =========================
// ✅ PREJUÍZO DO MÊS (IDÊNTICO AO /api/vendas/prejuizo)
// - purchases CLOSED/finalizedAt no mês
// - recalcula via Sales (ignora CANCELED)
// - pvCents fallback: total - fee
// - calcula bônus 30% por venda
// - filtra somente finalProfitCents < 0
// - remove “sem venda” (includeZeroSales = false)
// =========================

function milheiroFrom(points: number, pointsValueCents: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValueCents, 0);
  if (!pts || !cents) return 0;
  return Math.round((cents * 1000) / pts);
}

function bonus30(points: number, milheiroCents: number, metaMilheiroCents: number) {
  const pts = safeInt(points, 0);
  const mil = safeInt(milheiroCents, 0);
  const meta = safeInt(metaMilheiroCents, 0);
  if (!pts || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

function monthBoundsISO(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) return null;
  const startISO = `${ym}-01`;
  const endISO = nextMonthStart(ym);
  if (!endISO) return null;
  return { startISO, endISO };
}

async function computeLossTotalCentsLikePrejuizo(team: string, scopeMonth: string) {
  const mb = monthBoundsISO(scopeMonth);
  if (!mb) return 0;

  const start = new Date(`${mb.startISO}T00:00:00.000Z`);
  const end = new Date(`${mb.endISO}T00:00:00.000Z`);

  const saleDb = prisma.sale as any;
  const manualLossAgg = await saleDb.aggregate({
    where: {
      program: "SMILES",
      smilesLocatorManualStatus: "DERRUBADO",
      smilesLocatorManualCheckedAt: { not: null, gte: start, lt: end },
      smilesLocatorLossCents: { gt: 0 },
      cedente: { owner: { team } },
    },
    _sum: { smilesLocatorLossCents: true },
  });
  const manualLossTotalCents = safeInt(manualLossAgg?._sum?.smilesLocatorLossCents, 0);

  // purchases fechadas no mês (já filtrado por mês, diferente do /prejuizo que busca tudo e filtra depois)
  const purchasesBase = await prisma.purchase.findMany({
    where: {
      status: "CLOSED",
      finalizedAt: { not: null, gte: start, lt: end },
      cedente: { owner: { team } },
    },
    orderBy: [{ finalizedAt: "desc" }, { updatedAt: "desc" }],
    take: 5000,
    select: {
      id: true,
      numero: true,
      metaMilheiroCents: true,
      totalCents: true,
      finalizedAt: true,
    },
  });

  if (purchasesBase.length === 0) return -manualLossTotalCents;

  const ids = purchasesBase.map((p) => p.id);
  const numeros = purchasesBase.map((p) => String(p.numero || "").trim()).filter(Boolean);

  const idByNumeroUpper = new Map<string, string>(
    purchasesBase
      .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
      .filter(([k]) => !!k)
  );

  const numerosUpper = Array.from(new Set(numeros.map((n) => n.toUpperCase())));
  const numerosLower = Array.from(new Set(numeros.map((n) => n.toLowerCase())));
  const numerosAll = Array.from(new Set([...numeros, ...numerosUpper, ...numerosLower]));

  function normalizePurchaseId(raw: string) {
    const r = (raw || "").trim();
    if (!r) return "";
    const upper = r.toUpperCase();
    return idByNumeroUpper.get(upper) || r;
  }

  const byId = new Map(purchasesBase.map((p) => [p.id, p]));

  // sales ligadas às purchases (ignora canceladas) — igual ao /prejuizo
  const sales = await prisma.sale.findMany({
    where: {
      paymentStatus: { not: "CANCELED" },
      OR: [{ purchaseId: { in: ids } }, { purchaseId: { in: numerosAll } }],
    },
    select: {
      purchaseId: true,
      points: true,
      totalCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
      passengers: true,
    },
  });

  const agg = new Map<
    string,
    {
      soldPoints: number;
      pax: number;
      salesTotalCents: number;
      salesPointsValueCents: number;
      salesTaxesCents: number;
      bonusCents: number;
      salesCount: number;
    }
  >();

  for (const s of sales) {
    const pid = normalizePurchaseId(String(s.purchaseId || ""));
    if (!pid) continue;

    const totalCents = safeInt(s.totalCents, 0);
    const feeCents = safeInt(s.embarqueFeeCents, 0);
    let pvCents = safeInt(s.pointsValueCents as any, 0);

    // fallback igual ao /prejuizo
    if (pvCents <= 0 && totalCents > 0) {
      const cand = Math.max(totalCents - feeCents, 0);
      pvCents = cand > 0 ? cand : totalCents;
    }

    const taxes = Math.max(totalCents - pvCents, 0);

    const cur =
      agg.get(pid) || {
        soldPoints: 0,
        pax: 0,
        salesTotalCents: 0,
        salesPointsValueCents: 0,
        salesTaxesCents: 0,
        bonusCents: 0,
        salesCount: 0,
      };

    cur.soldPoints += safeInt(s.points, 0);
    cur.pax += safeInt(s.passengers, 0);
    cur.salesTotalCents += totalCents;
    cur.salesPointsValueCents += pvCents;
    cur.salesTaxesCents += taxes;
    cur.salesCount += 1;

    // bônus por venda
    const p = byId.get(pid);
    if (p) {
      const mil = milheiroFrom(safeInt(s.points, 0), pvCents);
      cur.bonusCents += bonus30(safeInt(s.points, 0), mil, safeInt(p.metaMilheiroCents, 0));
    }

    agg.set(pid, cur);
  }

  // computa lucro líquido e soma só negativos, removendo “sem venda” (igual includeZeroSales=false)
  let lossTotalCents = 0; // negativo

  for (const p of purchasesBase) {
    const a =
      agg.get(p.id) || {
        soldPoints: 0,
        pax: 0,
        salesTotalCents: 0,
        salesPointsValueCents: 0,
        salesTaxesCents: 0,
        bonusCents: 0,
        salesCount: 0,
      };

    const purchaseTotalCents = safeInt(p.totalCents, 0);
    const profitBruto = a.salesPointsValueCents - purchaseTotalCents;
    const profitLiquido = profitBruto - a.bonusCents;

    // remove “sem venda” (includeZeroSales=false)
    const hasSales =
      safeInt(a.salesCount, 0) > 0 ||
      safeInt(a.salesPointsValueCents, 0) > 0 ||
      safeInt(a.salesTotalCents, 0) > 0 ||
      safeInt(a.soldPoints, 0) > 0;

    if (!hasSales) continue;

    if (profitLiquido < 0) lossTotalCents += profitLiquido;
  }

  return lossTotalCents - manualLossTotalCents;
}

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    if (!team || !meId) return bad("Não autenticado", 401);

    const url = new URL(req.url);
    const month = String(url.searchParams.get("month") || "");
    const date = String(url.searchParams.get("date") || "");
    const status = String(url.searchParams.get("status") || "ALL").toUpperCase(); // ALL | PAID | PENDING
    const mode = String(url.searchParams.get("mode") || "model").toLowerCase(); // model | raw

    if (mode !== "model" && mode !== "raw") return bad("mode inválido. Use model|raw");

    let startDate = "";
    let endExclusive = "";
    let scopeMonth = "";

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date inválido. Use YYYY-MM-DD");
      startDate = date;
      endExclusive = addDaysISO(date, 1);
      if (!endExclusive) return bad("date inválido");
      scopeMonth = date.slice(0, 7);
    } else {
      const m = month.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return bad("month inválido. Use YYYY-MM");
      startDate = `${m}-01`;
      endExclusive = nextMonthStart(m);
      if (!endExclusive) return bad("month inválido");
      scopeMonth = m;
    }

    const startDT = isoToUTCDate(startDate);
    const endDT = isoToUTCDate(endExclusive);
    if (!startDT || !endDT) return bad("Período inválido (datas)");

    const paymentStatusWhere =
      status === "PAID" ? "PAID" : status === "PENDING" ? "PENDING" : undefined;

    // ✅ vendas do período (conforme filtro de status)
    const sales = await prisma.sale.findMany({
      where: {
        cedente: { owner: { team } },
        date: { gte: startDT, lt: endDT },
        paymentStatus: paymentStatusWhere ? paymentStatusWhere : { in: ["PAID", "PENDING"] },
      },
      select: {
        id: true,
        numero: true,
        date: true,
        totalCents: true,
        paymentStatus: true,
        cliente: {
          select: { id: true, nome: true, identificador: true, cpfCnpj: true },
        },
      },
      orderBy: [{ date: "asc" }, { numero: "asc" }],
    });

    // ✅ operações de balcão no mesmo período (filtro por dia de Recife)
    const balcaoStart = recifeStartDate(startDate);
    const balcaoEnd = recifeStartDate(endExclusive);
    const balcaoOps = await prisma.balcaoOperacao.findMany({
      where: {
        team,
        createdAt: { gte: balcaoStart, lt: balcaoEnd },
      },
      select: {
        id: true,
        locator: true,
        createdAt: true,
        customerChargeCents: true,
        finalCliente: {
          select: { nome: true, identificador: true, cpfCnpj: true },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const salesCount = sales.length;
    const balcaoOpsCount = balcaoOps.length;
    const totalSoldSalesCents = sales.reduce((a, s) => a + (s.totalCents || 0), 0);
    const totalSoldBalcaoCents = balcaoOps.reduce((a, op) => a + (op.customerChargeCents || 0), 0);
    const totalSoldCents = totalSoldSalesCents + totalSoldBalcaoCents;

    // ✅ lucro do período (vendas) = soma grossProfitCents (SEM 8%)
    const lucroAgg = await prisma.employeePayout.aggregate({
      where: { team, date: { gte: startDate, lt: endExclusive } },
      _sum: { grossProfitCents: true },
    });
    const salesProfitTotalCents = Number(lucroAgg._sum.grossProfitCents || 0);

    // ✅ lucro líquido do balcão no mesmo período
    const balcaoNetProfitCents = await computeBalcaoNetProfitCents(
      team,
      startDate,
      endExclusive
    );

    // ✅ lucro total = vendas + balcão
    const profitTotalCents = salesProfitTotalCents + balcaoNetProfitCents;

    // ✅ PREJUÍZO DO MÊS (idêntico ao /prejuizo) — só quando filtro é mês inteiro
    const applyLoss = !date;
    const lossTotalCents = applyLoss
      ? await computeLossTotalCentsLikePrejuizo(team, scopeMonth)
      : 0; // negativo

    // ✅ lucro tributável (não deixar negativo)
    const profitAfterLossCents = Math.max(0, profitTotalCents + lossTotalCents);

    // =========================
    // RAW: UMA LINHA POR VENDA
    // =========================
    const splitItems = [
      ...sales.map((s) => ({ key: `SALE:${s.id}`, totalCents: s.totalCents || 0 })),
      ...balcaoOps.map((op) => ({ key: `BALCAO:${op.id}`, totalCents: op.customerChargeCents || 0 })),
    ];

    const profitByItem = splitProfitProportional(
      splitItems,
      profitAfterLossCents
    );

    const rowsRawSales = sales.map((s) => {
      const cpfCnpjDisplay = s?.cliente?.cpfCnpj || s?.cliente?.identificador || "—";
      const nome = s?.cliente?.nome || "—";
      const profitCents = profitByItem.get(`SALE:${s.id}`) || 0;
      const deductionCents = Math.max(0, (s.totalCents || 0) - profitCents);

      return {
        saleId: `SALE:${s.id}`,
        date: isoDateOnlyUTC(s.date),
        numero: s.numero || "—",
        paymentStatus: String((s as any)?.paymentStatus || "—"),
        cpfCnpj: cpfCnpjDisplay,
        nome,
        totalServiceCents: s.totalCents || 0,
        deductionCents,
        profitCents,
      };
    });

    const rowsRawBalcao = balcaoOps.map((op) => {
      const cpfCnpjDisplay =
        op.finalCliente?.cpfCnpj || op.finalCliente?.identificador || "—";
      const nome = op.finalCliente?.nome || "—";
      const totalServiceCents = safeInt(op.customerChargeCents, 0);
      const profitCents = profitByItem.get(`BALCAO:${op.id}`) || 0;
      const deductionCents = Math.max(0, totalServiceCents - profitCents);
      const numero =
        (op.locator || "").trim() ||
        `BALCAO-${String(op.id || "").slice(-6).toUpperCase()}`;

      return {
        saleId: `BALCAO:${op.id}`,
        date: recifeDateISO(op.createdAt),
        numero,
        paymentStatus: "BALCAO",
        cpfCnpj: cpfCnpjDisplay,
        nome,
        totalServiceCents,
        deductionCents,
        profitCents,
      };
    });

    const rowsRaw = [...rowsRawSales, ...rowsRawBalcao].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return String(a.numero || "").localeCompare(String(b.numero || ""));
    });

    const totalDeductionRawCents = rowsRaw.reduce((a, r) => a + (r.deductionCents || 0), 0);

    // =========================
    // MODEL: AGRUPADO POR CLIENTE
    // =========================
    const map = new Map<
      string,
      { key: string; cpfCnpj: string; nome: string; totalServiceCents: number; salesCount: number }
    >();

    for (const s of sales) {
      const doc = cleanDoc(s?.cliente?.cpfCnpj || s?.cliente?.identificador || "") || "";
      const cpfCnpjDisplay = s?.cliente?.cpfCnpj || s?.cliente?.identificador || "—";
      const nome = s?.cliente?.nome || "—";
      const key = `${doc}::${nome}`;

      const prev = map.get(key) || {
        key,
        cpfCnpj: cpfCnpjDisplay,
        nome,
        totalServiceCents: 0,
        salesCount: 0,
      };

      prev.totalServiceCents += s.totalCents || 0;
      prev.salesCount += 1;
      map.set(key, prev);
    }

    for (const op of balcaoOps) {
      const doc = cleanDoc(op?.finalCliente?.cpfCnpj || op?.finalCliente?.identificador || "") || "";
      const cpfCnpjDisplay = op?.finalCliente?.cpfCnpj || op?.finalCliente?.identificador || "—";
      const nome = op?.finalCliente?.nome || "—";
      const key = `${doc}::${nome}`;

      const prev = map.get(key) || {
        key,
        cpfCnpj: cpfCnpjDisplay,
        nome,
        totalServiceCents: 0,
        salesCount: 0,
      };

      prev.totalServiceCents += safeInt(op.customerChargeCents, 0);
      prev.salesCount += 1;
      map.set(key, prev);
    }

    const groups = Array.from(map.values());

    const profitMapModel = splitProfitProportional(
      groups.map((g) => ({ key: g.key, totalCents: g.totalServiceCents })),
      profitAfterLossCents
    );

    const rowsModel = groups
      .map((g) => {
        const profitCents = profitMapModel.get(g.key) || 0;
        const deductionCents = Math.max(0, (g.totalServiceCents || 0) - profitCents);

        const info = date
          ? `Vendas do dia ${date} (${g.salesCount} venda(s))`
          : `Vendas do mês ${scopeMonth} (${g.salesCount} venda(s))`;

        return {
          cpfCnpj: g.cpfCnpj,
          nome: g.nome,
          info,
          totalServiceCents: g.totalServiceCents,
          deductionCents,
          profitCents,
          salesCount: g.salesCount,
        };
      })
      .sort((a, b) => b.totalServiceCents - a.totalServiceCents);

    const totalDeductionModelCents = rowsModel.reduce(
      (a, r) => a + (r.deductionCents || 0),
      0
    );

    const endDate = addDaysISO(endExclusive, -1);

    return NextResponse.json({
      ok: true,
      mode,
      scope: { month: scopeMonth, date: date || null, status: status || "ALL" },
      startDate,
      endDate,
      totals: {
        salesCount,
        balcaoOpsCount,
        totalSoldCents,
        totalSoldSalesCents,
        totalSoldBalcaoCents,
        profitTotalCents, // SEM 8%
        salesProfitTotalCents,
        balcaoNetProfitCents,
        lossTotalCents, // ✅ igual /prejuizo
        profitAfterLossCents,
        totalDeductionCents: mode === "raw" ? totalDeductionRawCents : totalDeductionModelCents,
      },
      rows: mode === "raw" ? rowsRaw : rowsModel,
    });
  } catch (e: any) {
    const msg =
      e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
