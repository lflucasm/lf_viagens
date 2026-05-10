/** Percentual (0–100) do lucro milheiro que entra na comissão do vendedor. Null = 100%. */
export function resolveMilheiroSellerPayoutPercent(stored: number | null | undefined) {
  if (stored == null || !Number.isFinite(Number(stored))) return 100;
  return Math.max(0, Math.min(100, Math.round(Number(stored))));
}
