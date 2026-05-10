import { prisma } from "@/lib/prisma";
import type { PurchaseItem, Purchase } from "@prisma/client";

function roundInt(n: number) {
  return Math.round(n);
}

function asInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

const CLUB_PROGRAMS = new Set(["LATAM", "SMILES", "LIVELO", "ESFERA"]);

export type ClubMonthEntryJson = {
  program: string;
  points: number;
};

export type ClubDetailsParsed = {
  billingCycle?: string;
  program?: string;
  monthSchedule?: ClubMonthEntryJson[];
  tierK?: number;
  bonusPoints?: number;
};

export function parseClubDetails(details: string | null | undefined): ClubDetailsParsed | null {
  if (!details) return null;
  try {
    return JSON.parse(details) as ClubDetailsParsed;
  } catch {
    return null;
  }
}

function normalizeClubProgram(raw: unknown): string | null {
  const s = String(raw || "").trim().toUpperCase();
  return CLUB_PROGRAMS.has(s) ? s : null;
}

/** Soma dos pontos do cronograma (vários meses / programas). */
export function clubScheduleTotalPoints(details: string | null | undefined): number | null {
  const meta = parseClubDetails(details);
  const sched = meta?.monthSchedule;
  if (!Array.isArray(sched) || sched.length === 0) return null;
  let s = 0;
  for (const row of sched) {
    s += Math.max(0, asInt(row.points, 0));
  }
  return s > 0 ? s : null;
}

/** Clube sem cronograma: mantém regra anual ×12 sobre pointsFinal. */
function legacyClubEffectivePoints(item: Pick<PurchaseItem, "pointsFinal" | "details">): number {
  const pf = asInt(item.pointsFinal, 0);
  const meta = parseClubDetails(item.details);
  if (String(meta?.billingCycle || "").toUpperCase() === "ANNUAL") return pf * 12;
  return pf;
}

/** Pontos no denominador do milheiro (soma do cronograma ou legado). */
export function effectivePointsForMilheiroFromItem(
  item: Pick<PurchaseItem, "type" | "pointsFinal" | "details" | "status">
): number {
  if (item.status === "CANCELED") return 0;
  if (item.type === "POINTS_BUY") return asInt(item.pointsFinal, 0);
  if (item.type === "CLUB") {
    const fromSched = clubScheduleTotalPoints(item.details);
    if (fromSched != null) return fromSched;
    return legacyClubEffectivePoints(item);
  }
  return 0;
}

export function itemContributesToCompraMilheiro(item: Pick<PurchaseItem, "type" | "status">): boolean {
  if (item.status === "CANCELED") return false;
  return item.type === "POINTS_BUY" || item.type === "CLUB";
}

/**
 * Expande item CLUB em fatias por programa para agregar custo/pontos.
 * Custo rateado proporcionalmente aos pontos de cada linha do cronograma.
 */
export function clubItemSlicesForAggregation(
  item: Pick<PurchaseItem, "type" | "pointsFinal" | "details" | "amountCents" | "status" | "programTo">
): { program: string; points: number; costCents: number }[] {
  if (item.status === "CANCELED" || item.type !== "CLUB") return [];

  const totalCost = asInt(item.amountCents, 0);
  const meta = parseClubDetails(item.details);
  const sched = meta?.monthSchedule;

  if (Array.isArray(sched) && sched.length > 0) {
    const rows = sched
      .map((r) => ({
        program: normalizeClubProgram(r.program),
        points: Math.max(0, asInt(r.points, 0)),
      }))
      .filter((r) => r.program && r.points > 0) as { program: string; points: number }[];

    if (rows.length === 0) return [];

    const totalPts = rows.reduce((s, r) => s + r.points, 0);
    if (totalPts <= 0) return [];

    return rows.map((r) => ({
      program: r.program,
      points: r.points,
      costCents: Math.round((totalCost * r.points) / totalPts),
    }));
  }

  const prog =
    normalizeClubProgram(meta?.program) ||
    normalizeClubProgram(item.programTo) ||
    null;
  if (!prog) return [];

  const pts = legacyClubEffectivePoints(item);
  if (pts <= 0) return [];
  return [{ program: prog, points: pts, costCents: totalCost }];
}

/** Soma custo e pontos “efetivos” só de compra de pontos + clube (para milheiro). */
export function computePurchaseMilheiroInputs(items: PurchaseItem[]) {
  let costCents = 0;
  let pointsEffective = 0;
  for (const i of items) {
    if (!itemContributesToCompraMilheiro(i)) continue;
    costCents += asInt(i.amountCents, 0);
    pointsEffective += effectivePointsForMilheiroFromItem(i);
  }
  const milheiroCents =
    pointsEffective > 0 && costCents > 0 ? roundInt((costCents * 1000) / pointsEffective) : 0;
  return { costCents, pointsEffective, milheiroCents };
}

function pointsForMilheiroFallback(compra: Purchase) {
  const c: any = compra as any;
  const cia = (c.ciaAerea ?? c.ciaProgram ?? null) as string | null;

  if (cia === "LATAM") return asInt(c.saldoPrevistoLatam ?? c.expectedLatamPoints ?? c.pontosCiaTotal ?? 0);
  if (cia === "SMILES") return asInt(c.saldoPrevistoSmiles ?? c.expectedSmilesPoints ?? c.pontosCiaTotal ?? 0);
  if (cia === "LIVELO") return asInt(c.saldoPrevistoLivelo ?? c.pontosCiaTotal ?? 0);
  if (cia === "ESFERA") return asInt(c.saldoPrevistoEsfera ?? c.pontosCiaTotal ?? 0);

  return asInt(c.pontosCiaTotal ?? 0);
}

export async function recomputeCompra(purchaseId: string) {
  const compra = (await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  })) as (Purchase & { items: PurchaseItem[] }) | null;

  if (!compra) return null;

  const itensAtivos = (compra.items ?? []).filter((i) => i.status !== "CANCELED");

  const itemsCostCents = itensAtivos.reduce((acc, i) => acc + asInt(i.amountCents, 0), 0);

  /** Compras operacionais: custo total = soma dos itens. */
  const subtotalCents = itemsCostCents;
  const comissaoCents = 0;
  const totalCents = subtotalCents;

  const { milheiroCents: milheiroFromItems, pointsEffective } = computePurchaseMilheiroInputs(itensAtivos);

  let custoMilheiroCents = milheiroFromItems;
  if (pointsEffective <= 0 || milheiroFromItems <= 0) {
    const pontos = Math.max(0, pointsForMilheiroFallback(compra));
    custoMilheiroCents = pontos > 0 ? roundInt((totalCents * 1000) / pontos) : 0;
  }

  const metaMilheiroCents = custoMilheiroCents;

  const updated = await prisma.purchase.update({
    where: { id: compra.id },
    data: {
      subtotalCents,
      comissaoCents,
      totalCents,
      custoMilheiroCents,
      metaMilheiroCents,
    },
  });

  return updated;
}
