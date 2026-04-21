import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  balcaoProfitSemTaxaCents,
  buildTaxRule,
  netProfitAfterTaxCents,
  recifeDateISO,
  resolveTaxPercent,
  sellerCommissionCentsFromNet,
  taxFromProfitCents,
} from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function monthISORecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`; // YYYY-MM
}

function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function nextMonthStart(month: string) {
  const [y, m] = month.split("-").map((x) => safeInt(x, 0));
  if (!y || !m) return "9999-12-01";
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as { team?: unknown })?.team || "");
    const meId = String((sess as { id?: unknown })?.id || "");
    const role = String((sess as { role?: unknown })?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = String(searchParams.get("month") || "").trim();
    const month = isMonthISO(monthParam) ? monthParam : monthISORecife();

    const startDate = `${month}-01`;
    const endDate = nextMonthStart(month);

    const [users, payouts, settings] = await Promise.all([
      prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.employeePayout.findMany({
        where: {
          team,
          date: { gte: startDate, lt: endDate },
        },
        select: {
          userId: true,
          date: true,
          grossProfitCents: true,
          tax7Cents: true,
          feeCents: true,
          netPayCents: true,
          breakdown: true,
        },
      }),
      prisma.settings.upsert({
        where: { key: "default" },
        create: { key: "default" },
        update: {},
        select: { taxPercent: true, taxEffectiveFrom: true },
      }),
    ]);

    const taxRule = buildTaxRule(settings);

    const balcaoStart = new Date(`${month}-01T00:00:00-03:00`);
    const balcaoEnd = new Date(`${endDate}T00:00:00-03:00`);

    const balcaoOps = await prisma.balcaoOperacao.findMany({
      where: {
        team,
        employeeId: { not: null },
        createdAt: { gte: balcaoStart, lt: balcaoEnd },
      },
      select: {
        employeeId: true,
        createdAt: true,
        customerChargeCents: true,
        supplierPayCents: true,
        boardingFeeCents: true,
      },
    });

    const byUser: Record<
      string,
      {
        days: number;
        salesCount: number;

        c1: number;
        c2: number;
        c3: number;

        gross: number;
        payoutTax: number;
        fee: number;

        payoutNetNoFee: number;
        netWithFee: number;

        balcaoOps: number;
        balcaoGross: number;
        balcaoTax: number;
        balcaoCommission: number;
      }
    > = {};

    function ensure(userId: string) {
      return (byUser[userId] ||= {
        days: 0,
        salesCount: 0,
        c1: 0,
        c2: 0,
        c3: 0,
        gross: 0,
        payoutTax: 0,
        fee: 0,
        payoutNetNoFee: 0,
        netWithFee: 0,
        balcaoOps: 0,
        balcaoGross: 0,
        balcaoTax: 0,
        balcaoCommission: 0,
      });
    }

    for (const p of payouts) {
      const a = ensure(p.userId);
      const b = (p.breakdown || {}) as {
        salesCount?: number;
        commission1Cents?: number;
        commission2Cents?: number;
        commission3RateioCents?: number;
      };

      const gross = safeInt(p.grossProfitCents, 0);
      const tax = safeInt(p.tax7Cents, 0);
      const fee = safeInt(p.feeCents, 0);
      const netWithFee = safeInt(p.netPayCents, 0);
      const netNoFee = gross - tax;

      a.days += 1;
      a.salesCount += safeInt(b.salesCount, 0);

      a.c1 += safeInt(b.commission1Cents, 0);
      a.c2 += safeInt(b.commission2Cents, 0);
      a.c3 += safeInt(b.commission3RateioCents, 0);

      a.gross += gross;
      a.payoutTax += tax;
      a.fee += fee;

      a.payoutNetNoFee += netNoFee;
      a.netWithFee += netWithFee;
    }

    for (const op of balcaoOps) {
      const userId = String(op.employeeId || "").trim();
      if (!userId) continue;

      const a = ensure(userId);
      const opDateISO = recifeDateISO(op.createdAt);
      const taxPercent = resolveTaxPercent(opDateISO, taxRule);
      const opGross = safeInt(
        balcaoProfitSemTaxaCents({
          customerChargeCents: op.customerChargeCents,
          supplierPayCents: op.supplierPayCents,
          boardingFeeCents: op.boardingFeeCents,
        }),
        0
      );
      const opTax = safeInt(taxFromProfitCents(opGross, taxPercent), 0);
      const opNetNoFee = safeInt(netProfitAfterTaxCents(opGross, opTax), 0);
      const opCommission = safeInt(sellerCommissionCentsFromNet(opNetNoFee), 0);

      a.balcaoOps += 1;
      a.balcaoGross += opGross;
      a.balcaoTax += opTax;
      a.balcaoCommission += opCommission;
    }

    const rows = users.map((u) => {
      const a =
        byUser[u.id] ||
        ({
          days: 0,
          salesCount: 0,
          c1: 0,
          c2: 0,
          c3: 0,
          gross: 0,
          payoutTax: 0,
          fee: 0,
          payoutNetNoFee: 0,
          netWithFee: 0,
          balcaoOps: 0,
          balcaoGross: 0,
          balcaoTax: 0,
          balcaoCommission: 0,
        } as const);

      return {
        user: { id: u.id, name: u.name, login: u.login, role: u.role },
        days: a.days,
        salesCount: a.salesCount,

        commission1Cents: a.c1,
        commission2Cents: a.c2,
        commission3RateioCents: a.c3,

        grossCents: a.gross,
        taxCents: a.payoutTax + a.balcaoTax,
        payoutTaxCents: a.payoutTax,
        balcaoTaxCents: a.balcaoTax,
        feeCents: a.fee,

        balcaoOpsCount: a.balcaoOps,
        balcaoGrossCents: a.balcaoGross,
        balcaoCommissionCents: a.balcaoCommission,

        netNoFeeCents: a.payoutNetNoFee + a.balcaoCommission,
        netWithFeeCents: a.netWithFee,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.days += r.days;
        acc.salesCount += r.salesCount;
        acc.c1 += r.commission1Cents;
        acc.c2 += r.commission2Cents;
        acc.c3 += r.commission3RateioCents;
        acc.gross += r.grossCents;
        acc.tax += r.taxCents;
        acc.payoutTax += r.payoutTaxCents;
        acc.balcaoTax += r.balcaoTaxCents;
        acc.fee += r.feeCents;
        acc.balcaoOps += r.balcaoOpsCount;
        acc.balcaoGross += r.balcaoGrossCents;
        acc.balcaoCommission += r.balcaoCommissionCents;
        acc.netNoFee += r.netNoFeeCents;
        acc.netWithFee += r.netWithFeeCents;
        return acc;
      },
      {
        days: 0,
        salesCount: 0,
        c1: 0,
        c2: 0,
        c3: 0,
        gross: 0,
        tax: 0,
        payoutTax: 0,
        balcaoTax: 0,
        fee: 0,
        balcaoOps: 0,
        balcaoGross: 0,
        balcaoCommission: 0,
        netNoFee: 0,
        netWithFee: 0,
      }
    );

    return NextResponse.json({
      ok: true,
      month,
      startDate,
      endDate,
      rows,
      totals,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message ? e.message : String(e);
    const normalized = msg === "UNAUTHENTICATED" ? "Não autenticado" : msg;
    const status = msg === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: normalized }, { status });
  }
}
