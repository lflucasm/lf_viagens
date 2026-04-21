import { prisma } from "@/lib/prisma";
import type { LoyaltyProgram, Settings } from "@prisma/client";

type SessionLike = { userId: string; team: string; role?: string };

const TZ_OFFSET = "-03:00"; // Recife

export function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00.000${TZ_OFFSET}`);
  const end = new Date(`${date}T00:00:00.000${TZ_OFFSET}`);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function todayISORecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  return `${map.year}-${map.month}-${map.day}`;
}

function tax8(cents: number) {
  return Math.round((cents ?? 0) * 0.08);
}

function costFromSettings(program: LoyaltyProgram, settings: Settings | null) {
  if (!settings) {
    if (program === "LATAM") return 2000;
    if (program === "SMILES") return 1800;
    if (program === "LIVELO") return 2200;
    return 1700;
  }

  if (program === "LATAM") return settings.latamRateCents ?? 2000;
  if (program === "SMILES") return settings.smilesRateCents ?? 1800;
  if (program === "LIVELO") return settings.liveloRateCents ?? 2200;
  return settings.esferaRateCents ?? 1700;
}

function pickShareForDate(
  shares: Array<{
    effectiveFrom: Date;
    effectiveTo: Date | null;
    items: Array<{ payeeId: string; bps: number }>;
  }>,
  saleDate: Date
) {
  for (const s of shares) {
    if (s.effectiveFrom && s.effectiveFrom > saleDate) continue;
    if (s.effectiveTo && saleDate >= s.effectiveTo) continue;
    return s;
  }
  return null;
}

function splitByBps(pool: number, items: Array<{ payeeId: string; bps: number }>) {
  const out: Record<string, number> = {};
  if (!pool || pool <= 0 || !items?.length) return out;

  let used = 0;
  for (const it of items) {
    const v = Math.floor((pool * it.bps) / 10000);
    out[it.payeeId] = (out[it.payeeId] ?? 0) + v;
    used += v;
  }

  const rem = pool - used;
  if (rem !== 0) {
    let best = items[0];
    for (const it of items) if (it.bps > best.bps) best = it;
    out[best.payeeId] = (out[best.payeeId] ?? 0) + rem;
  }

  return out;
}

/** =========================
 *  Base helpers (PV / C1 / C2)
 * ========================= */

/** PV bruto (milheiro * pts/1000) — pode estar "com taxa" dependendo da origem do milheiro */
function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * (milheiroCents ?? 0));
}

/** ✅ PV sem taxa (fallback): (milheiro*pts/1000) - fee */
export function pointsValueNoFeeFallback(points: number, milheiroCents: number, feeCents: number) {
  const gross = pointsValueCentsFallback(points, milheiroCents);
  return Math.max(0, gross - (feeCents ?? 0));
}

/** milheiro derivado do PV sem taxa (pra bônus não “contaminar”) */
export function milheiroNoFeeFromPv(points: number, pvNoFeeCents: number) {
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round((pvNoFeeCents ?? 0) / denom);
}

export function commission1Fallback(pointsValueNoFeeCents: number) {
  return Math.round((pointsValueNoFeeCents ?? 0) * 0.01);
}

/** bônus 30% do excedente acima da meta (milheiro SEM taxa) */
export function bonusFallback(args: {
  points: number;
  milheiroNoFeeCents: number;
  metaMilheiroCents: number | null | undefined;
}) {
  const { points, milheiroNoFeeCents, metaMilheiroCents } = args;
  const meta = Number(metaMilheiroCents ?? 0);
  if (!meta) return 0;

  const diff = (milheiroNoFeeCents ?? 0) - meta;
  if (diff <= 0) return 0;

  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;

  const diffTotal = Math.round(denom * diff);
  return Math.round(diffTotal * 0.3);
}

/**
 * ✅ helpers para “default 0” do Prisma
 * Regra:
 * - pointsValueCents no banco deve ser PV SEM taxa (se estiver >0, confia)
 * - se PV vier 0, calcula PV sem taxa pelo fallback (milheiro*pts/1000 - fee)
 */
export function choosePvNoFee(points: number, pvDb: number, milheiroCents: number, feeCents: number) {
  if ((pvDb ?? 0) > 0) return pvDb;
  if ((points ?? 0) > 0) return pointsValueNoFeeFallback(points, milheiroCents, feeCents);
  return 0;
}

export function chooseC1(points: number, c1Db: number, pvNoFee: number) {
  if ((c1Db ?? 0) > 0) return c1Db;
  if ((points ?? 0) > 0 && (pvNoFee ?? 0) > 0) return commission1Fallback(pvNoFee);
  return 0;
}

export function chooseC2(
  points: number,
  c2Db: number,
  milheiroNoFeeCents: number,
  metaMilheiroCents: number | null | undefined
) {
  if ((c2Db ?? 0) > 0) return c2Db;
  if ((points ?? 0) > 0) return bonusFallback({ points, milheiroNoFeeCents, metaMilheiroCents });
  return 0;
}

function chooseCostMilheiro(program: LoyaltyProgram, costDb: number, settings: Settings | null) {
  if ((costDb ?? 0) > 0) return costDb;
  return costFromSettings(program, settings);
}

export function chooseMetaMilheiro(metaSaleOrPurchase: number | null | undefined) {
  const v = Number(metaSaleOrPurchase ?? 0);
  return v > 0 ? v : 0;
}

/** ✅ lucro do rateio usa PV(sem taxa) - custo */
function profitForSaleFromPvCents(args: {
  points: number;
  pvNoFeeCents: number;
  costMilheiroCents: number;
}) {
  const { points, pvNoFeeCents, costMilheiroCents } = args;
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;

  const costCents = Math.round(denom * (costMilheiroCents ?? 0));
  return Math.round((pvNoFeeCents ?? 0) - costCents);
}

export async function computeEmployeePayoutDay(session: SessionLike, date: string) {
  const { start, end } = dayBounds(date);
  const settings = await prisma.settings.findFirst({});

  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: start, lt: end },
      cedente: { owner: { team: session.team } },
      paymentStatus: { not: "CANCELED" },
    },
    select: {
      id: true,
      date: true,
      program: true,
      points: true,

      // ⚠️ milheiro pode estar “com taxa” dependendo do teu cálculo lá na venda
      milheiroCents: true,

      embarqueFeeCents: true,

      // default 0 no schema
      commissionCents: true,
      bonusCents: true,
      pointsValueCents: true, // esperado: PV sem taxa

      metaMilheiroCents: true,

      sellerId: true,
      purchase: { select: { custoMilheiroCents: true, metaMilheiroCents: true } },
      cedente: { select: { ownerId: true } },
    },
  });

  const ownerIds = Array.from(new Set(sales.map((s) => s.cedente.ownerId).filter(Boolean)));

  const shares = await prisma.profitShare.findMany({
    where: {
      team: session.team,
      ownerId: { in: ownerIds.length ? ownerIds : ["__none__"] },
      isActive: true,
      effectiveFrom: { lte: end },
    },
    orderBy: { effectiveFrom: "desc" },
    include: { items: true },
  });

  const sharesByOwner: Record<string, typeof shares> = {};
  for (const s of shares) (sharesByOwner[s.ownerId] ||= []).push(s);

  type Agg = {
    commission1Cents: number;
    commission2Cents: number;
    rateioCents: number;
    feeCents: number;
    salesCount: number;
  };

  const byUser: Record<string, Agg> = {};
  const ensure = (u: string) =>
    (byUser[u] ||= {
      commission1Cents: 0,
      commission2Cents: 0,
      rateioCents: 0,
      feeCents: 0,
      salesCount: 0,
    });

  for (const s of sales) {
    const sellerId = s.sellerId ?? null;
    const fee = s.embarqueFeeCents ?? 0;

    // ✅ PV SEM TAXA (se 0 no banco, calcula por fallback - fee)
    const pvNoFee = choosePvNoFee(s.points, s.pointsValueCents, s.milheiroCents, fee);

    // ✅ milheiro SEM taxa (para bônus)
    const milheiroNoFee = milheiroNoFeeFromPv(s.points, pvNoFee);

    // ✅ C1: 1% do PV sem taxa
    const c1 = chooseC1(s.points, s.commissionCents, pvNoFee);

    // ✅ meta do bônus (sale > purchase)
    const meta = chooseMetaMilheiro(
      (s.metaMilheiroCents ?? 0) > 0 ? s.metaMilheiroCents : s.purchase?.metaMilheiroCents
    );

    // ✅ C2: bônus calculado sobre milheiro sem taxa
    const c2 = chooseC2(s.points, s.bonusCents, milheiroNoFee, meta);

    // ✅ comissão + reembolso taxa -> seller
    if (sellerId) {
      const a = ensure(sellerId);
      a.commission1Cents += c1;
      a.commission2Cents += c2;
      a.feeCents += fee; // ✅ reembolso de taxa (não entra em comissão/rateio)
      a.salesCount += 1;
    }

    // ✅ rateio -> ProfitShare do OWNER do cedente
    const ownerId = s.cedente.ownerId;
    const ownerShares = sharesByOwner[ownerId] || [];

    const share = pickShareForDate(
      ownerShares.map((x) => ({
        effectiveFrom: x.effectiveFrom,
        effectiveTo: x.effectiveTo,
        items: x.items.map((i) => ({ payeeId: i.payeeId, bps: i.bps })),
      })),
      s.date
    );

    if (!share?.items?.length) continue;

    // ✅ custo milheiro (compra > settings)
    const costMilheiro = chooseCostMilheiro(s.program, s.purchase?.custoMilheiroCents ?? 0, settings);

    // ✅ lucro do rateio SEM taxa: PV(sem taxa) - custo
    const profit = profitForSaleFromPvCents({
      points: s.points,
      pvNoFeeCents: pvNoFee,
      costMilheiroCents: costMilheiro,
    });

    // ✅ pool do rateio: lucro - comissão - bônus
    const pool = Math.max(0, profit - c1 - c2);
    if (pool <= 0) continue;

    const splits = splitByBps(pool, share.items);
    for (const payeeId of Object.keys(splits)) {
      const a = ensure(payeeId);
      a.rateioCents += splits[payeeId] ?? 0;
    }
  }

  const userIds = Object.keys(byUser);

  // remove payouts “lixo” não pagos e sem movimento
  await prisma.employeePayout.deleteMany({
    where: {
      team: session.team,
      date,
      paidById: null,
      userId: { notIn: userIds.length ? userIds : ["__none__"] },
    },
  });

  // upsert
  for (const userId of userIds) {
    const a = byUser[userId];
    const gross = a.commission1Cents + a.commission2Cents + a.rateioCents;

    const tax = tax8(gross);
    const net = gross - tax + a.feeCents;

    await prisma.employeePayout.upsert({
      where: { team_date_userId: { team: session.team, date, userId } },
      create: {
        team: session.team,
        date,
        userId,
        grossProfitCents: gross,
        tax7Cents: tax,
        feeCents: a.feeCents,
        netPayCents: net,
        breakdown: {
          commission1Cents: a.commission1Cents,
          commission2Cents: a.commission2Cents,
          commission3RateioCents: a.rateioCents,
          salesCount: a.salesCount,
          taxPercent: 8,
        },
      },
      update: {
        grossProfitCents: gross,
        tax7Cents: tax,
        feeCents: a.feeCents,
        netPayCents: net,
        breakdown: {
          commission1Cents: a.commission1Cents,
          commission2Cents: a.commission2Cents,
          commission3RateioCents: a.rateioCents,
          salesCount: a.salesCount,
          taxPercent: 8,
        },
      },
    });
  }

  return { ok: true, date, users: userIds.length, sales: sales.length };
}
