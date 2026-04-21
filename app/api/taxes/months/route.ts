import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

const TAX_TZ = "America/Recife";
const DEFAULT_TAX_PERCENT = 8;

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function toNumber(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizePercent(v: unknown, fallback = DEFAULT_TAX_PERCENT) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function recifeDateISO(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function recifeMonthKey(date: Date) {
  return recifeDateISO(date).slice(0, 7);
}

function resolveTaxPercent(
  dateISO: string,
  settings: { configuredPercent: number; effectiveISO: string | null }
) {
  if (!settings.effectiveISO) return DEFAULT_TAX_PERCENT;
  return dateISO >= settings.effectiveISO ? settings.configuredPercent : DEFAULT_TAX_PERCENT;
}

function taxByPercent(profitCents: number, percent: number) {
  return Math.round(Math.max(0, toNumber(profitCents)) * (percent / 100));
}

function normalizedBalcaoProfit(row: {
  customerChargeCents: number;
  supplierPayCents: number;
  boardingFeeCents: number;
}) {
  return (
    toNumber(row.customerChargeCents) -
    toNumber(row.supplierPayCents) -
    toNumber(row.boardingFeeCents)
  );
}

function parseSnapshotComponents(payment: {
  totalTaxCents: number;
  breakdown: unknown;
}) {
  const legacyTotal = toNumber(payment.totalTaxCents);
  const raw = payment.breakdown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      payoutTaxCents: legacyTotal,
      balcaoTaxCents: 0,
      totalTaxCents: legacyTotal,
    };
  }

  const anyRaw = raw as Record<string, unknown>;
  const components = anyRaw.components;
  if (!components || typeof components !== "object" || Array.isArray(components)) {
    return {
      payoutTaxCents: legacyTotal,
      balcaoTaxCents: 0,
      totalTaxCents: legacyTotal,
    };
  }

  const anyComp = components as Record<string, unknown>;
  const payoutTaxCents = toNumber(anyComp.payoutTaxCents);
  const balcaoTaxCents = toNumber(anyComp.balcaoTaxCents);
  const totalTaxCents = toNumber(payment.totalTaxCents || payoutTaxCents + balcaoTaxCents);

  return {
    payoutTaxCents,
    balcaoTaxCents,
    totalTaxCents,
  };
}

export async function GET(req: Request) {
  try {
    const session = await requireSession(req); // { userId, team, role? }
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 24), 1), 60);

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const taxSettings = {
      configuredPercent: normalizePercent(settings.taxPercent, DEFAULT_TAX_PERCENT),
      effectiveISO: settings.taxEffectiveFrom
        ? settings.taxEffectiveFrom.toISOString().slice(0, 10)
        : null,
    };

    const payoutRows = await prisma.$queryRaw<
      Array<{
        month: string;
        taxCents: bigint;
        usersCount: number;
        daysCount: number;
      }>
    >`
      SELECT
        substring(ep."date", 1, 7) AS "month",
        COALESCE(SUM(ep."tax7Cents"), 0)::bigint AS "taxCents",
        COUNT(DISTINCT ep."userId")::int AS "usersCount",
        COUNT(*)::int AS "daysCount"
      FROM "employee_payouts" ep
      WHERE ep."team" = ${session.team}
      GROUP BY 1
    `;

    const payoutByMonth = new Map<
      string,
      { payoutTaxCents: number; usersCount: number; daysCount: number }
    >();
    for (const row of payoutRows) {
      payoutByMonth.set(row.month, {
        payoutTaxCents: toNumber(row.taxCents),
        usersCount: toNumber(row.usersCount),
        daysCount: toNumber(row.daysCount),
      });
    }

    const balcaoRows = await prisma.balcaoOperacao.findMany({
      where: { team: session.team },
      select: {
        createdAt: true,
        customerChargeCents: true,
        supplierPayCents: true,
        boardingFeeCents: true,
      },
    });

    const balcaoByMonth = new Map<string, { balcaoTaxCents: number; balcaoOpsCount: number }>();
    for (const row of balcaoRows) {
      const dateISO = recifeDateISO(row.createdAt);
      const month = recifeMonthKey(row.createdAt);
      const percent = resolveTaxPercent(dateISO, taxSettings);
      const taxCents = taxByPercent(normalizedBalcaoProfit(row), percent);

      const current = balcaoByMonth.get(month) || { balcaoTaxCents: 0, balcaoOpsCount: 0 };
      current.balcaoTaxCents += taxCents;
      current.balcaoOpsCount += 1;
      balcaoByMonth.set(month, current);
    }

    const allMonths = Array.from(
      new Set<string>([...payoutByMonth.keys(), ...balcaoByMonth.keys()])
    )
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);

    const payments = await prisma.taxMonthPayment.findMany({
      where: { team: session.team, month: { in: allMonths.length ? allMonths : ["__none__"] } },
      select: {
        month: true,
        totalTaxCents: true,
        breakdown: true,
        paidAt: true,
        paidBy: { select: { id: true, name: true } },
      },
    });

    const payByMonth = new Map(payments.map((p) => [p.month, p]));

    const monthsOut = allMonths.map((month) => {
      const payout = payoutByMonth.get(month) || { payoutTaxCents: 0, usersCount: 0, daysCount: 0 };
      const balcao = balcaoByMonth.get(month) || { balcaoTaxCents: 0, balcaoOpsCount: 0 };
      const computedTotal = payout.payoutTaxCents + balcao.balcaoTaxCents;

      const payment = payByMonth.get(month);
      const paidAt = payment?.paidAt ? payment.paidAt.toISOString() : null;
      const snapshot = payment?.paidAt ? parseSnapshotComponents(payment) : null;

      const payoutTaxCents = snapshot ? snapshot.payoutTaxCents : payout.payoutTaxCents;
      const balcaoTaxCents = snapshot ? snapshot.balcaoTaxCents : balcao.balcaoTaxCents;
      const taxCents = snapshot ? snapshot.totalTaxCents : computedTotal;

      return {
        month,
        taxCents,
        payoutTaxCents,
        balcaoTaxCents,
        usersCount: payout.usersCount,
        daysCount: payout.daysCount,
        balcaoOpsCount: balcao.balcaoOpsCount,
        paidAt,
        paidBy: payment?.paidBy ? { id: payment.paidBy.id, name: payment.paidBy.name } : null,
        snapshotTaxCents: payment?.paidAt ? toNumber(payment.totalTaxCents) : null,
        snapshotPayoutTaxCents: payment?.paidAt ? payoutTaxCents : null,
        snapshotBalcaoTaxCents: payment?.paidAt ? balcaoTaxCents : null,
      };
    });

    const totalTax = monthsOut.reduce((acc, m) => acc + m.taxCents, 0);
    const totalPayoutTax = monthsOut.reduce((acc, m) => acc + m.payoutTaxCents, 0);
    const totalBalcaoTax = monthsOut.reduce((acc, m) => acc + m.balcaoTaxCents, 0);

    const paidTax = monthsOut.reduce((acc, m) => acc + (m.paidAt ? m.taxCents : 0), 0);
    const paidPayoutTax = monthsOut.reduce((acc, m) => acc + (m.paidAt ? m.payoutTaxCents : 0), 0);
    const paidBalcaoTax = monthsOut.reduce((acc, m) => acc + (m.paidAt ? m.balcaoTaxCents : 0), 0);

    const pendingTax = Math.max(0, totalTax - paidTax);
    const pendingPayoutTax = Math.max(0, totalPayoutTax - paidPayoutTax);
    const pendingBalcaoTax = Math.max(0, totalBalcaoTax - paidBalcaoTax);

    const monthsPaid = monthsOut.filter((m) => !!m.paidAt).length;
    const monthsPending = monthsOut.length - monthsPaid;

    return NextResponse.json({
      ok: true,
      months: monthsOut,
      totals: {
        tax: totalTax,
        taxPayout: totalPayoutTax,
        taxBalcao: totalBalcaoTax,
        paid: paidTax,
        paidPayout: paidPayoutTax,
        paidBalcao: paidBalcaoTax,
        pending: pendingTax,
        pendingPayout: pendingPayoutTax,
        pendingBalcao: pendingBalcaoTax,
        monthsPaid,
        monthsPending,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message ? e.message : String(e);
    const status = msg.includes("Não autenticado") ? 401 : 500;
    return bad(status, msg);
  }
}
