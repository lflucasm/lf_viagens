export type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

export function clampInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
export function endOfYearExclusive(d = new Date()) {
  return new Date(d.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
}

// ✅ limite anual por programa (ajusta depois se quiser)
export function passengerLimit(program: Program) {
  // hoje seu foco é LATAM; deixei 25 padrão pros 4.
  return 25;
}

export function pointsField(program: Program) {
  if (program === "LATAM") return "pontosLatam";
  if (program === "SMILES") return "pontosSmiles";
  if (program === "LIVELO") return "pontosLivelo";
  return "pontosEsfera";
}

export function formatSaleNumber(n: number) {
  const s = String(n).padStart(5, "0");
  return `VE${s}`;
}

export function moneyToCentsBR(input: string) {
  const s = (input || "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function calcPointsValueCents(points: number, milheiroCents: number) {
  const denom = points / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * milheiroCents);
}

export function calcCommissionCents(pointsValueCents: number) {
  return Math.round(pointsValueCents * 0.01);
}

export function calcBonusCents(points: number, milheiroCents: number, metaMilheiroCents: number) {
  if (!metaMilheiroCents) return 0;
  const diff = milheiroCents - metaMilheiroCents;
  if (diff <= 0) return 0;
  const denom = points / 1000;
  const diffTotal = Math.round(denom * diff);
  return Math.round(diffTotal * 0.3);
}
