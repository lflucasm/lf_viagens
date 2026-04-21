// app/api/payouts/funcionarios/details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  chooseC1,
  chooseC2,
  chooseMetaMilheiro,
  choosePvNoFee,
  milheiroNoFeeFromPv,
} from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function isISOMonth(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function monthFromISODate(dateISO: string) {
  return String(dateISO || "").slice(0, 7);
}

/**
 * Bounds do dia em UTC para não “perder” vendas por timezone.
 * dateISO: "YYYY-MM-DD"
 */
function dayBoundsUTC(dateISO: string) {
  if (!isISODate(dateISO)) {
    throw new Error("date inválido. Use YYYY-MM-DD");
  }
  const start = new Date(`${dateISO}T00:00:00.000Z`);
  const end = new Date(`${dateISO}T24:00:00.000Z`);
  return { start, end };
}

/**
 * Bounds do mês em UTC.
 * month: "YYYY-MM"
 */
function monthBoundsUTC(month: string) {
  if (!isISOMonth(month)) {
    throw new Error("month inválido. Use YYYY-MM");
  }
  const [yy, mm] = month.split("-").map((x) => Number(x));
  const start = new Date(Date.UTC(yy, mm - 1, 1));
  const end = new Date(Date.UTC(yy, mm, 1)); // 1º do mês seguinte
  return { start, end };
}

function isoDayUTC(d: Date) {
  // Date -> "YYYY-MM-DD" em UTC
  return d.toISOString().slice(0, 10);
}

function norm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normLogin(s: string) {
  return norm(s).replace(/^@+/, "").replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
}

function extractLoginHint(label?: string | null) {
  const raw = String(label || "").trim();
  if (!raw) return "";

  const mAt = raw.match(/@([a-zA-Z0-9._-]+)/);
  if (mAt?.[1]) return normLogin(mAt[1]);

  const mPar = raw.match(/\(([^)]+)\)/);
  if (mPar?.[1]) {
    const inside = mPar[1].trim().replace(/^@/, "");
    if (inside && !inside.includes(" ")) return normLogin(inside);
  }

  return "";
}

function extractCardOwnerName(label?: string | null) {
  let s = norm(label || "");
  if (!s) return "";

  if (s.startsWith("cartao ")) s = s.slice("cartao ".length).trim();

  for (const sep of [" - ", " (", " [", " | ", " • ", " · "]) {
    const idx = s.indexOf(sep);
    if (idx >= 0) {
      s = s.slice(0, idx).trim();
      break;
    }
  }

  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

function isCompanyCardName(owner: string) {
  const s = norm(owner);
  if (!s) return false;

  const needles = [
    "vias aereas",
    "via s aereas",
    "trademiles",
    "empresa",
    "corporativo",
    "business",
    "pj",
    "ltda",
    "viagens e turismo",
  ];
  return needles.some((k) => s.includes(k));
}

type TeamMemberLite = { id: string; nameNorm: string; loginNorm: string };

function resolveFeePayerFromLabel(
  feeCardLabel: string | null | undefined,
  members: TeamMemberLite[]
): { ignore: boolean; userId: string | null; source: "card" | "fallback" | "company" | "none" } {
  const label = String(feeCardLabel || "").trim();
  if (!label) return { ignore: false, userId: null, source: "none" };

  const ownerName = extractCardOwnerName(label);
  if (ownerName && isCompanyCardName(ownerName)) return { ignore: true, userId: null, source: "company" };

  const loginHint = extractLoginHint(label);
  if (loginHint) {
    const byLogin = members.find((m) => m.loginNorm === loginHint);
    if (byLogin) return { ignore: false, userId: byLogin.id, source: "card" };
  }

  if (!ownerName) return { ignore: false, userId: null, source: "none" };
  const ownerNorm = norm(ownerName);

  const byNameExact = members.find((m) => m.nameNorm === ownerNorm);
  if (byNameExact) return { ignore: false, userId: byNameExact.id, source: "card" };

  let candidates = members.filter(
    (m) => (m.nameNorm && m.nameNorm.includes(ownerNorm)) || (m.nameNorm && ownerNorm.includes(m.nameNorm))
  );
  if (candidates.length === 1) return { ignore: false, userId: candidates[0].id, source: "card" };

  const tok = ownerNorm.split(" ")[0] || "";
  if (tok) {
    const tokLogin = normLogin(tok);
    candidates = members.filter((m) => {
      const firstName = (m.nameNorm.split(" ")[0] || "").trim();
      return firstName === tok || m.loginNorm === tokLogin || m.nameNorm.includes(tok);
    });
    if (candidates.length === 1) return { ignore: false, userId: candidates[0].id, source: "card" };
  }

  return { ignore: false, userId: null, source: "none" };
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  const url = new URL(req.url);

  const date = String(url.searchParams.get("date") || "").trim(); // sempre obrigatório (pra UX do front)
  const userId = String(url.searchParams.get("userId") || "").trim();
  const includeLines = String(url.searchParams.get("includeLines") || "") === "1";
  const month = String(url.searchParams.get("month") || "").trim(); // opcional "YYYY-MM"

  if (!date) return bad("date é obrigatório (YYYY-MM-DD)");
  if (!isISODate(date)) return bad("date inválido. Use YYYY-MM-DD");
  if (!userId) return bad("userId é obrigatório");
  if (month && !isISOMonth(month)) return bad("month inválido. Use YYYY-MM");

  const scopeMonth = !!month;
  const monthKey = scopeMonth ? month.slice(0, 7) : monthFromISODate(date);

  // ✅ carrega payouts do banco (fonte de verdade)
  const payouts = await prisma.employeePayout.findMany({
    where: {
      team: session.team,
      userId,
      ...(scopeMonth ? { date: { startsWith: monthKey } } : { date }),
    },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
    take: scopeMonth ? 80 : 1,
  });

  const payout = payouts[0] || null;

  const base = {
    ok: true,
    scope: scopeMonth ? "month" : "day",
    date,
    month: monthKey,
    user: payout?.user || null,
    payout: payout
      ? {
          id: payout.id,
          team: payout.team,
          date: payout.date,
          userId: payout.userId,
          grossProfitCents: safeInt(payout.grossProfitCents, 0),
          tax7Cents: safeInt(payout.tax7Cents, 0),
          feeCents: safeInt(payout.feeCents, 0),
          netPayCents: safeInt(payout.netPayCents, 0),
          paidAt: payout.paidAt ? payout.paidAt.toISOString() : null,
          paidById: payout.paidById ?? null,
          paidBy: payout.paidBy ?? null,
        }
      : null,
    payouts: scopeMonth
      ? payouts.map((p) => ({
          date: p.date,
          grossProfitCents: safeInt(p.grossProfitCents, 0),
          tax7Cents: safeInt(p.tax7Cents, 0),
          feeCents: safeInt(p.feeCents, 0),
          netPayCents: safeInt(p.netPayCents, 0),
          breakdown: (p.breakdown as unknown) ?? null,
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          paidById: p.paidById ?? null,
        }))
      : undefined,
    breakdown: payout ? ((payout.breakdown as unknown) ?? null) : null,
    explain: payout
      ? {
          gross: "Bruto = C1 + C2 + C3",
          tax: "Imposto = 8% (salvo em tax7Cents)",
          fee: "Taxas = reembolso taxa embarque (feeCents)",
          lucroSemTaxa: "Lucro s/ taxa = gross - tax",
          net: "Líquido (a pagar) = netPayCents (já inclui fee)",
        }
      : null,
  };

  if (!includeLines) {
    return NextResponse.json(base);
  }

  // ==========================
  // ✅ modo “linhas”: auditoria por SALES
  // ==========================
  let start: Date;
  let end: Date;

  try {
    if (scopeMonth) {
      const b = monthBoundsUTC(monthKey);
      start = b.start;
      end = b.end;
    } else {
      const b = dayBoundsUTC(date);
      start = b.start;
      end = b.end;
    }
  } catch (e: unknown) {
    return bad(e instanceof Error && e.message ? e.message : "Parâmetro inválido");
  }

  const membersRaw = await prisma.user.findMany({
    where: { team: session.team, role: { in: ["admin", "staff"] } },
    select: { id: true, name: true, login: true },
  });
  const members: TeamMemberLite[] = membersRaw.map((u) => ({
    id: String(u.id),
    nameNorm: norm(String(u.name || "")),
    loginNorm: normLogin(String(u.login || "")),
  }));

  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: start, lt: end },
      paymentStatus: { not: "CANCELED" },
      cedente: { owner: { team: session.team } },
    },
    select: {
      id: true,
      date: true,
      numero: true,
      locator: true,
      points: true,
      milheiroCents: true,
      pointsValueCents: true,
      commissionCents: true,
      bonusCents: true,
      metaMilheiroCents: true,
      embarqueFeeCents: true,
      feeCardLabel: true,
      sellerId: true,
      seller: { select: { id: true, name: true, login: true } },
      cliente: { select: { id: true, identificador: true, nome: true } },
      cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
      purchase: {
        select: {
          id: true,
          numero: true,
          metaMilheiroCents: true,
        },
      },
    },
    orderBy: { date: "asc" },
    take: 5000,
  });

  const lineFromSale = (s: (typeof sales)[number]) => {
    const fee = safeInt(s.embarqueFeeCents, 0);
    const points = safeInt(s.points, 0);
    const isSeller = s.sellerId === userId;
    const feePayer = resolveFeePayerFromLabel(s.feeCardLabel, members);
    const resolvedFeePayerId = feePayer.userId || s.sellerId || null;
    const isFeePayer = fee > 0 && !feePayer.ignore && resolvedFeePayerId === userId;

    if (!isSeller && !isFeePayer) return null;

    const pvNoFee = choosePvNoFee(
      points,
      safeInt(s.pointsValueCents, 0),
      safeInt(s.milheiroCents, 0),
      fee
    );
    const milheiroNoFee = milheiroNoFeeFromPv(points, pvNoFee);
    const meta = chooseMetaMilheiro(
      safeInt(s.metaMilheiroCents, 0) > 0
        ? safeInt(s.metaMilheiroCents, 0)
        : safeInt(s.purchase?.metaMilheiroCents, 0)
    );

    const c1 = isSeller ? chooseC1(points, safeInt(s.commissionCents, 0), pvNoFee) : 0;
    const c2 = isSeller ? chooseC2(points, safeInt(s.bonusCents, 0), milheiroNoFee, meta) : 0;

    return {
      ref: { type: "sale", id: s.id },
      numero: s.numero,
      locator: s.locator || null,
      date: s.date.toISOString(),
      sellerId: s.sellerId || null,
      seller: s.seller
        ? { id: s.seller.id, name: s.seller.name, login: s.seller.login }
        : null,
      cliente: s.cliente
        ? { id: s.cliente.id, identificador: s.cliente.identificador, nome: s.cliente.nome }
        : null,
      cedente: s.cedente
        ? { id: s.cedente.id, identificador: s.cedente.identificador, nomeCompleto: s.cedente.nomeCompleto }
        : null,
      purchase: s.purchase
        ? { id: s.purchase.id, numero: s.purchase.numero }
        : null,
      feeCardLabel: s.feeCardLabel || null,
      role: {
        seller: isSeller,
        feePayer: isFeePayer,
      },
      feePayer: {
        resolvedUserId: resolvedFeePayerId,
        source: feePayer.userId ? feePayer.source : s.sellerId ? "fallback" : feePayer.source,
        ignoredCompanyCard: feePayer.ignore,
      },
      points,
      pointsValueCents: pvNoFee,
      c1Cents: c1,
      c2Cents: c2,
      c3Cents: 0, // ⚠️ C3 depende da sua regra real
      feeCents: isFeePayer ? fee : 0,
      saleFeeCents: fee,
    };
  };

  if (!scopeMonth) {
    const lines = sales.map(lineFromSale).filter((line): line is NonNullable<typeof line> => Boolean(line));

    const sum = lines.reduce(
      (acc, it) => {
        acc.gross += it.c1Cents + it.c2Cents + it.c3Cents;
        acc.fee += it.feeCents;
        return acc;
      },
      { gross: 0, fee: 0 }
    );

    const audit =
      payout
        ? {
            linesGrossCents: sum.gross,
            payoutGrossCents: safeInt(payout.grossProfitCents, 0),
            diffGrossCents: sum.gross - safeInt(payout.grossProfitCents, 0),

            linesFeeCents: sum.fee,
            payoutFeeCents: safeInt(payout.feeCents, 0),
            diffFeeCents: sum.fee - safeInt(payout.feeCents, 0),
          }
        : null;

    return NextResponse.json({
      ...base,
      lines: { sales: lines },
      audit,
      note:
        "As linhas são uma auditoria/explicação. A fonte de verdade do pagamento é o payout salvo em employee_payouts.",
    });
  }

  // ✅ mês: agrupa por dia (YYYY-MM-DD)
  type DetailLine = NonNullable<ReturnType<typeof lineFromSale>>;
  const byDay = new Map<string, DetailLine[]>();
  for (const s of sales) {
    const line = lineFromSale(s);
    if (!line) continue;

    const d = isoDayUTC(new Date(s.date));
    const arr = byDay.get(d) || [];
    arr.push(line);
    byDay.set(d, arr);
  }

  const days = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, items]) => {
      const sums = items.reduce(
        (acc, it) => {
          acc.gross += it.c1Cents + it.c2Cents + it.c3Cents;
          acc.fee += it.feeCents;
          acc.salesCount += 1;
          return acc;
        },
        { gross: 0, fee: 0, salesCount: 0 }
      );
      return { date: d, sales: items, sums };
    });

  const totalLines = days.reduce(
    (acc, day) => {
      acc.gross += day.sums.gross;
      acc.fee += day.sums.fee;
      acc.salesCount += day.sums.salesCount;
      return acc;
    },
    { gross: 0, fee: 0, salesCount: 0 }
  );

  const totalPayouts = payouts.reduce(
    (acc, p) => {
      acc.gross += safeInt(p.grossProfitCents, 0);
      acc.fee += safeInt(p.feeCents, 0);
      return acc;
    },
    { gross: 0, fee: 0 }
  );

  const auditMonth = {
    linesGrossCents: totalLines.gross,
    payoutsGrossCents: totalPayouts.gross,
    diffGrossCents: totalLines.gross - totalPayouts.gross,

    linesFeeCents: totalLines.fee,
    payoutsFeeCents: totalPayouts.fee,
    diffFeeCents: totalLines.fee - totalPayouts.fee,

    linesSalesCount: totalLines.salesCount,
  };

  return NextResponse.json({
    ...base,
    lines: { days },
    audit: auditMonth,
    note:
      "As linhas são uma auditoria/explicação por SALES. A fonte de verdade do pagamento é o payout salvo em employee_payouts.",
  });
}
