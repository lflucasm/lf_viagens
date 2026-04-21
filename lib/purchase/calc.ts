// lib/purchase/calc.ts

import type { LoyaltyProgram, PurchaseItemType, TransferMode } from "@prisma/client";

export type BonusMode = "PERCENT" | "TOTAL" | null;

export type PurchaseItemDraft = {
  type: PurchaseItemType;
  title: string;

  programFrom?: LoyaltyProgram | null;
  programTo?: LoyaltyProgram | null;

  pointsBase?: number | null;
  bonusMode?: BonusMode;
  bonusValue?: number | null;

  amountCents?: number | null;

  transferMode?: TransferMode | null;
  pointsDebitedFromOrigin?: number | null;

  details?: string | null;
};

export function clampInt(n: unknown, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.trunc(v);
}

export function computePointsFinal(item: PurchaseItemDraft) {
  const base = Math.max(0, clampInt(item.pointsBase, 0));
  const mode = item.bonusMode ?? null;
  const bonusValue = item.bonusValue == null ? null : clampInt(item.bonusValue, 0);

  // se não tem bônus, final = base
  if (!mode || bonusValue == null || bonusValue <= 0) return base;

  if (mode === "PERCENT") {
    // ex: base 100000, bonus 30% => 130000
    const bonusPts = Math.floor((base * bonusValue) / 100);
    return base + bonusPts;
  }

  // mode === "TOTAL" => bonusValue é o bônus em pontos
  return base + bonusValue;
}

export function validatePurchaseItemDraft(item: PurchaseItemDraft) {
  const errors: string[] = [];

  if (!item.title?.trim()) errors.push("Item sem título.");

  const type = item.type;

  const pointsBase = Math.max(0, clampInt(item.pointsBase, 0));
  const amountCents = Math.max(0, clampInt(item.amountCents, 0));

  // Regras por tipo (simples e práticas)
  if (type === "TRANSFER") {
    if (!item.programFrom) errors.push("TRANSFER precisa programFrom.");
    if (!item.programTo) errors.push("TRANSFER precisa programTo.");
    if (!item.transferMode) errors.push("TRANSFER precisa transferMode.");

    // em TRANSFER sempre faz sentido ter pointsBase
    if (pointsBase <= 0) errors.push("TRANSFER precisa pointsBase > 0.");

    if (item.transferMode === "POINTS_PLUS_CASH") {
      const debited = Math.max(0, clampInt(item.pointsDebitedFromOrigin, 0));
      if (debited <= 0) errors.push("POINTS_PLUS_CASH precisa pointsDebitedFromOrigin > 0.");
      // amountCents pode ser > 0 (cash)
    }
  }

  if (type === "POINTS_BUY") {
    if (pointsBase <= 0) errors.push("POINTS_BUY precisa pointsBase > 0.");
    // amountCents deve ser o custo da compra de pontos
    // pode ser 0 se você quer lançar depois, mas normalmente > 0
  }

  if (type === "CLUB") {
    // clube pode ter amountCents > 0 e pointsBase pode ser 0
    if (amountCents <= 0) errors.push("CLUB precisa amountCents > 0.");
  }

  if (type === "EXTRA_COST") {
    if (amountCents <= 0) errors.push("EXTRA_COST precisa amountCents > 0.");
  }

  if (type === "ADJUSTMENT") {
    // ajuste pode ser + ou - no futuro; por enquanto só permitimos >=0
    // se você quiser permitir negativo depois, eu adapto o schema e as regras
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeDraft(item: PurchaseItemDraft) {
  const pointsFinal = computePointsFinal(item);
  return {
    ...item,
    title: String(item.title || "").trim(),
    details: item.details ? String(item.details) : null,
    pointsBase: Math.max(0, clampInt(item.pointsBase, 0)),
    pointsFinal,
    amountCents: Math.max(0, clampInt(item.amountCents, 0)),
    bonusMode: item.bonusMode ?? null,
    bonusValue: item.bonusValue == null ? null : Math.max(0, clampInt(item.bonusValue, 0)),
    programFrom: item.programFrom ?? null,
    programTo: item.programTo ?? null,
    transferMode: item.transferMode ?? null,
    pointsDebitedFromOrigin: Math.max(0, clampInt(item.pointsDebitedFromOrigin, 0)),
  };
}
