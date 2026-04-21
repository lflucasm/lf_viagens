// app/api/vendas/prejuizo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noCacheHeaders() });
}

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}
function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}
async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}
function monthBoundsUTC(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) return null;
  const start = new Date(`${ym}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}
function monthKeyFromISO(iso?: string | null) {
  if (!iso) return null;
  const s = String(iso);
  return s.length >= 7 ? s.slice(0, 7) : null;
}

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

type MonthAgg = { month: string; count: number; sumProfitCents: number };

export async function GET(req: NextRequest) {
  try {
    // garante auth (seu helper)
    await requireSession();

    const session = await getServerSession();
    if (!session?.id) return bad("Não autenticado", 401);

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();
    const month = String(searchParams.get("month") || "").trim(); // YYYY-MM
    const take = clamp(safeInt(searchParams.get("take"), 2000), 1, 5000);
    const includeZeroSales = String(searchParams.get("includeZeroSales") || "") === "1";

    // ✅ buscamos TODAS finalizadas do team (pra montar meses/gráfico)
    const wherePurch: any = {
      status: "CLOSED",
      finalizedAt: { not: null },
      cedente: { owner: { team: session.team } },
    };

    if (q) {
      wherePurch.OR = [
        { numero: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },
        { cedente: { identificador: { contains: q, mode: "insensitive" } } },
        { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
      ];
    }

    const purchasesBase = await prisma.purchase.findMany({
      where: wherePurch,
      orderBy: [{ finalizedAt: "desc" }, { updatedAt: "desc" }],
      take: 5000, // limite pra não explodir
      select: {
        id: true,
        numero: true,
        status: true,
        ciaAerea: true,
        pontosCiaTotal: true,
        metaMilheiroCents: true,
        totalCents: true,
        finalizedAt: true,
        finalizedBy: { select: { id: true, name: true, login: true } },
        cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (purchasesBase.length === 0) {
      return NextResponse.json(
        { ok: true, purchases: [], months: [], totals: { allCount: 0, allProfitCents: 0, listCount: 0, listProfitCents: 0 } },
        { headers: noCacheHeaders() }
      );
    }

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

    const sales = await prisma.sale.findMany({
      where: {
        paymentStatus: { not: "CANCELED" }, // ✅ aqui que “cancelada” não entra
        OR: [{ purchaseId: { in: ids } }, { purchaseId: { in: numerosAll } }],
      },
      select: {
        id: true,
        date: true,
        purchaseId: true,
        points: true,
        passengers: true,
        totalCents: true,
        pointsValueCents: true,
        embarqueFeeCents: true,
        locator: true,
        paymentStatus: true,
        createdAt: true,
      },
    });

    const saleDb = prisma.sale as any;
    const manualLossSales = await saleDb.findMany({
      where: {
        program: "SMILES",
        smilesLocatorManualStatus: "DERRUBADO",
        smilesLocatorManualCheckedAt: { not: null },
        smilesLocatorLossCents: { gt: 0 },
        cedente: { owner: { team: session.team } },
        ...(q
          ? {
              OR: [
                { locator: { contains: q, mode: "insensitive" } },
                { cedente: { identificador: { contains: q, mode: "insensitive" } } },
                { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ smilesLocatorManualCheckedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        locator: true,
        smilesLocatorManualCheckedAt: true,
        smilesLocatorLossCents: true,
        updatedAt: true,
        createdAt: true,
        cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
      },
      take: 5000,
    });

    function normalizePurchaseId(raw: string) {
      const r = (raw || "").trim();
      if (!r) return "";
      const upper = r.toUpperCase();
      return idByNumeroUpper.get(upper) || r;
    }

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

    const salesByPurchase = new Map<string, any[]>();
    const byId = new Map(purchasesBase.map((p) => [p.id, p]));

    for (const s of sales) {
      const pid = normalizePurchaseId(String(s.purchaseId || ""));
      if (!pid) continue;

      const totalCents = safeInt(s.totalCents, 0);
      const feeCents = safeInt(s.embarqueFeeCents, 0);
      let pvCents = safeInt(s.pointsValueCents as any, 0);

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
      agg.set(pid, cur);

      const arr = salesByPurchase.get(pid) || [];
      arr.push({
        id: s.id,
        date: s.date,
        points: s.points,
        passengers: s.passengers,
        totalCents: s.totalCents,
        pointsValueCents: s.pointsValueCents,
        embarqueFeeCents: s.embarqueFeeCents,
        locator: s.locator,
        paymentStatus: s.paymentStatus,
      });
      salesByPurchase.set(pid, arr);

      // bônus por venda
      const p = byId.get(pid);
      if (p) {
        const mil = milheiroFrom(safeInt(s.points, 0), pvCents);
        const b = bonus30(safeInt(s.points, 0), mil, safeInt(p.metaMilheiroCents, 0));
        cur.bonusCents += b;
      }
    }

    // monta “out” calculado (igual compras finalizadas)
    const computed = purchasesBase.map((p) => {
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

      const avgMilheiro =
        a.soldPoints > 0 && a.salesPointsValueCents > 0
          ? Math.round((a.salesPointsValueCents * 1000) / a.soldPoints)
          : null;

      const remaining =
        safeInt(p.pontosCiaTotal, 0) > 0 ? Math.max(safeInt(p.pontosCiaTotal, 0) - a.soldPoints, 0) : null;

      const listSales = salesByPurchase.get(p.id) || [];

      return {
        ...p,
        _count: { sales: listSales.length },
        sales: listSales,

        finalSalesCents: a.salesTotalCents,
        finalSalesPointsValueCents: a.salesPointsValueCents,
        finalSalesTaxesCents: a.salesTaxesCents,

        finalProfitBrutoCents: profitBruto,
        finalBonusCents: a.bonusCents,
        finalProfitCents: profitLiquido,

        finalSoldPoints: a.soldPoints,
        finalPax: a.pax,
        finalAvgMilheiroCents: avgMilheiro,
        finalRemainingPoints: remaining,
      };
    });

    // ✅ agora sim: filtra prejuízo (<0) e remove “sem venda” (se não estiver em modo auditoria)
    const purchaseNeg = computed.filter((r) => {
      const profit = safeInt((r as any).finalProfitCents, 0);
      if (profit >= 0) return false;

      if (includeZeroSales) return true;

      const pv = safeInt((r as any).finalSalesPointsValueCents, 0);
      const tot = safeInt((r as any).finalSalesCents, 0);
      const pts = safeInt((r as any).finalSoldPoints, 0);
      const cnt = safeInt((r as any)._count?.sales, 0);

      return cnt > 0 || pv > 0 || tot > 0 || pts > 0;
    });

    const manualNeg = manualLossSales.map((s: any) => ({
      id: `smiles-loss-${s.id}`,
      numero: s.locator ? `DERRUBADO ${s.locator}` : `DERRUBADO ${s.id.slice(0, 8)}`,
      status: "CLOSED" as const,
      ciaAerea: "SMILES" as const,
      pontosCiaTotal: 0,
      finalSalesCents: 0,
      finalSalesPointsValueCents: 0,
      finalSalesTaxesCents: 0,
      finalProfitBrutoCents: -safeInt(s.smilesLocatorLossCents, 0),
      finalBonusCents: 0,
      finalProfitCents: -safeInt(s.smilesLocatorLossCents, 0),
      finalSoldPoints: 0,
      finalPax: 0,
      finalAvgMilheiroCents: null,
      finalRemainingPoints: null,
      finalizedAt: s.smilesLocatorManualCheckedAt ? new Date(s.smilesLocatorManualCheckedAt).toISOString() : null,
      finalizedBy: null,
      cedente: s.cedente,
      _count: { sales: 0 },
      sales: [],
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    const allNeg = [...purchaseNeg, ...manualNeg];

    // meses (do ALL prejuízo)
    const monthMap = new Map<string, MonthAgg>();
    let allProfitCents = 0;

    for (const r of allNeg) {
      const iso = r.finalizedAt ? new Date(r.finalizedAt).toISOString() : null;
      const mk = monthKeyFromISO(iso);
      const profit = safeInt((r as any).finalProfitCents, 0);

      if (mk) {
        const cur = monthMap.get(mk) || { month: mk, count: 0, sumProfitCents: 0 };
        cur.count += 1;
        cur.sumProfitCents += profit;
        monthMap.set(mk, cur);
      }
      allProfitCents += profit;
    }

    const months = Array.from(monthMap.values()).sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

    // lista (pode filtrar por mês)
    let list = allNeg;
    const mb = monthBoundsUTC(month);
    if (mb) {
      list = list.filter((r) => {
        if (!r.finalizedAt) return false;
        const d = new Date(r.finalizedAt);
        return d >= mb.start && d < mb.end;
      });
    }

    // ordena e corta
    list = list
      .sort((a, b) => {
        const da = a.finalizedAt ? new Date(a.finalizedAt).getTime() : 0;
        const db = b.finalizedAt ? new Date(b.finalizedAt).getTime() : 0;
        return db - da;
      })
      .slice(0, take);

    const listProfitCents = list.reduce((acc, r) => acc + safeInt((r as any).finalProfitCents, 0), 0);

    return NextResponse.json(
      {
        ok: true,
        purchases: list,
        months,
        totals: {
          allCount: allNeg.length,
          allProfitCents,
          listCount: list.length,
          listProfitCents,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return bad(e?.message || "Erro ao carregar prejuízos.", 500);
  }
}
