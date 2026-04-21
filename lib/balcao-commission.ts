export const BALCAO_TAX_DEFAULT_PERCENT = 8;
export const BALCAO_SELLER_COMMISSION_PERCENT = 60;
export const BALCAO_TZ = "America/Recife";

export type BalcaoTaxRule = {
  configuredPercent: number;
  effectiveISO: string | null;
};

export function normalizePercent(v: unknown, fallback = BALCAO_TAX_DEFAULT_PERCENT) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function recifeDateISO(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BALCAO_TZ,
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

export function buildTaxRule(settings: { taxPercent: number; taxEffectiveFrom: Date | null }): BalcaoTaxRule {
  return {
    configuredPercent: normalizePercent(settings.taxPercent, BALCAO_TAX_DEFAULT_PERCENT),
    effectiveISO: settings.taxEffectiveFrom
      ? settings.taxEffectiveFrom.toISOString().slice(0, 10)
      : null,
  };
}

export function resolveTaxPercent(dateISO: string, rule: BalcaoTaxRule) {
  if (!rule.effectiveISO) return BALCAO_TAX_DEFAULT_PERCENT;
  return dateISO >= rule.effectiveISO ? rule.configuredPercent : BALCAO_TAX_DEFAULT_PERCENT;
}

export function balcaoProfitSemTaxaCents(args: {
  customerChargeCents: number;
  supplierPayCents: number;
  boardingFeeCents: number;
}) {
  return (
    Number(args.customerChargeCents || 0) -
    Number(args.supplierPayCents || 0) -
    Number(args.boardingFeeCents || 0)
  );
}

export function taxFromProfitCents(profitCents: number, percent: number) {
  return Math.round(Math.max(0, Number(profitCents || 0)) * (percent / 100));
}

export function netProfitAfterTaxCents(profitCents: number, taxCents: number) {
  return Number(profitCents || 0) - Number(taxCents || 0);
}

export function sellerCommissionCentsFromNet(netProfitCents: number) {
  return Math.round(
    Math.max(0, Number(netProfitCents || 0)) *
      (BALCAO_SELLER_COMMISSION_PERCENT / 100)
  );
}
