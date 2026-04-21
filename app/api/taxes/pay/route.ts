import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

const TAX_TZ = "America/Recife";
const DEFAULT_TAX_PERCENT = 8;

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isValidMonth(m: string) {
  return /^\d{4}-\d{2}$/.test(m);
}

function currentMonthRecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAX_TZ,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
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

async function computeMonth(team: string, month: string) {
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

  const grouped = await prisma.employeePayout.groupBy({
    by: ["userId"],
    where: { team, date: { startsWith: month } },
    _sum: { tax7Cents: true },
    _count: { _all: true },
  });

  const userIds = grouped.map((g) => g.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds.length ? userIds : ["__none__"] } },
    select: { id: true, name: true, login: true },
  });

  const uById: Record<string, { name: string; login: string }> = {};
  for (const u of users) uById[u.id] = { name: u.name, login: u.login };

  const payoutBreakdown = grouped
    .map((g) => ({
      userId: g.userId,
      name: uById[g.userId]?.name || "-",
      login: uById[g.userId]?.login || "-",
      taxCents: g._sum.tax7Cents ?? 0,
      daysCount: g._count._all ?? 0,
    }))
    .sort((a, b) => (b.taxCents || 0) - (a.taxCents || 0));

  const payoutTaxCents = payoutBreakdown.reduce((acc, b) => acc + (b.taxCents || 0), 0);

  const balcaoRows = await prisma.balcaoOperacao.findMany({
    where: { team },
    select: {
      createdAt: true,
      customerChargeCents: true,
      supplierPayCents: true,
      boardingFeeCents: true,
    },
  });

  let balcaoTaxCents = 0;
  let balcaoOperationsCount = 0;
  for (const row of balcaoRows) {
    const dateISO = recifeDateISO(row.createdAt);
    if (!dateISO.startsWith(`${month}-`)) continue;
    const percent = resolveTaxPercent(dateISO, taxSettings);
    balcaoTaxCents += taxByPercent(normalizedBalcaoProfit(row), percent);
    balcaoOperationsCount += 1;
  }

  const totalTaxCents = payoutTaxCents + balcaoTaxCents;

  return {
    totalTaxCents,
    payoutTaxCents,
    balcaoTaxCents,
    balcaoOperationsCount,
    payoutBreakdown,
  };
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);

    const body = await req.json().catch(() => ({}));
    const month = String(body?.month || "").slice(0, 7);
    if (!isValidMonth(month)) return bad(400, "Body month inválido. Use YYYY-MM.");

    const cur = currentMonthRecife();
    if (month >= cur) return bad(400, "Só é permitido pagar mês fechado (anterior ao mês atual).");

    const existing = await prisma.taxMonthPayment.findUnique({
      where: { team_month: { team: session.team, month } },
      select: { paidAt: true },
    });

    if (existing?.paidAt) {
      return NextResponse.json({ ok: true });
    }

    const computed = await computeMonth(session.team, month);

    await prisma.taxMonthPayment.upsert({
      where: { team_month: { team: session.team, month } },
      create: {
        team: session.team,
        month,
        totalTaxCents: computed.totalTaxCents,
        breakdown: {
          payoutBreakdown: computed.payoutBreakdown,
          components: {
            payoutTaxCents: computed.payoutTaxCents,
            balcaoTaxCents: computed.balcaoTaxCents,
            balcaoOperationsCount: computed.balcaoOperationsCount,
          },
        },
        paidAt: new Date(),
        paidById: session.userId,
      },
      update: {
        totalTaxCents: computed.totalTaxCents,
        breakdown: {
          payoutBreakdown: computed.payoutBreakdown,
          components: {
            payoutTaxCents: computed.payoutTaxCents,
            balcaoTaxCents: computed.balcaoTaxCents,
            balcaoOperationsCount: computed.balcaoOperationsCount,
          },
        },
        paidAt: new Date(),
        paidById: session.userId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message ? e.message : String(e);
    const status = msg.includes("Não autenticado") ? 401 : 500;
    return bad(status, msg);
  }
}
