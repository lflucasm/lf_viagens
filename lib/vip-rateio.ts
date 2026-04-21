export const VIP_RATEIO_DEFAULT_OWNER_BPS = 7000;
export const VIP_RATEIO_DEFAULT_OTHERS_BPS = 3000;
export const VIP_RATEIO_DEFAULT_TAX_BPS = 1000;
export const VIP_RATEIO_DEFAULT_PAYOUT_DAYS = "1";

export type VipRateioSettingValue = {
  ownerPercentBps: number;
  othersPercentBps: number;
  taxPercentBps: number;
  payoutDays: number[];
};

export type VipRateioPaymentInput = {
  amountCents: number;
  responsibleEmployeeId: string;
};

export type VipRateioDistributionResult = {
  earningsByEmployeeId: Map<string, number>;
  ownPaidByEmployeeId: Map<string, number>;
  totals: {
    totalPaidCents: number;
    totalTaxCents: number;
    totalNetCents: number;
    totalOwnerShareCents: number;
    totalOthersShareCents: number;
  };
};

export function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function parsePayoutDaysCsv(input: string | null | undefined) {
  const source = String(input || VIP_RATEIO_DEFAULT_PAYOUT_DAYS);
  const raw = source
    .split(/[,\s;|/]+/g)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  const uniqueSorted = Array.from(
    new Set(raw.map((n) => clampInt(n, 1, 31)))
  ).sort((a, b) => a - b);

  if (uniqueSorted.length === 0) return [1];
  return uniqueSorted;
}

export function payoutDaysToCsv(days: number[]) {
  const normalized = Array.from(
    new Set(days.map((d) => clampInt(d, 1, 31)))
  ).sort((a, b) => a - b);
  return normalized.length > 0 ? normalized.join(",") : VIP_RATEIO_DEFAULT_PAYOUT_DAYS;
}

export function toRateioSetting(
  input: {
    ownerPercentBps?: number | null;
    othersPercentBps?: number | null;
    taxPercentBps?: number | null;
    payoutDaysCsv?: string | null;
  } | null
): VipRateioSettingValue {
  const owner = clampInt(
    Number(input?.ownerPercentBps ?? VIP_RATEIO_DEFAULT_OWNER_BPS),
    0,
    10000
  );
  const others = clampInt(
    Number(input?.othersPercentBps ?? VIP_RATEIO_DEFAULT_OTHERS_BPS),
    0,
    10000
  );
  const tax = clampInt(
    Number(input?.taxPercentBps ?? VIP_RATEIO_DEFAULT_TAX_BPS),
    0,
    10000
  );

  return {
    ownerPercentBps: owner,
    othersPercentBps: others,
    taxPercentBps: tax,
    payoutDays: parsePayoutDaysCsv(input?.payoutDaysCsv),
  };
}

export function resolveMonthRef(input: string | null | undefined, now = new Date()) {
  const raw = String(input || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);

  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1;

  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
  }

  if (!Number.isFinite(year) || year < 2000 || year > 2100) year = now.getUTCFullYear();
  if (!Number.isFinite(month) || month < 1 || month > 12) month = now.getUTCMonth() + 1;

  const monthRef = `${year}-${String(month).padStart(2, "0")}`;
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const nextStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { monthRef, start, nextStart, year, month };
}

export function payoutDatesForReferenceMonth(monthRef: string, payoutDays: number[]) {
  const resolved = resolveMonthRef(monthRef);
  const payYear = resolved.month === 12 ? resolved.year + 1 : resolved.year;
  const payMonth = resolved.month === 12 ? 1 : resolved.month + 1;
  const daysInPayMonth = new Date(Date.UTC(payYear, payMonth, 0)).getUTCDate();

  return payoutDays.map((day) => {
    const validDay = clampInt(day, 1, 31);
    const applied = Math.min(validDay, daysInPayMonth);
    return new Date(Date.UTC(payYear, payMonth - 1, applied, 12, 0, 0, 0));
  });
}

export function normalizeEmployeeShares(
  employeeIds: string[],
  input: Map<string, number> | null | undefined
) {
  const ordered = Array.from(new Set(employeeIds)).sort((a, b) => a.localeCompare(b));
  const out = new Map<string, number>();

  if (ordered.length === 0) return out;

  if (!input || input.size === 0) {
    const base = Math.floor(10000 / ordered.length);
    let remainder = 10000 - base * ordered.length;
    for (const id of ordered) {
      out.set(id, base + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder -= 1;
    }
    return out;
  }

  for (const id of ordered) {
    out.set(id, clampInt(Number(input.get(id) || 0), 0, 10000));
  }
  return out;
}

function splitByWeights(params: {
  totalCents: number;
  employeeIds: string[];
  weightsByEmployeeId?: Map<string, number> | null;
}) {
  const total = Math.max(0, Math.trunc(params.totalCents));
  const ids = params.employeeIds.slice().sort((a, b) => a.localeCompare(b));
  const result = new Map<string, number>();
  for (const id of ids) result.set(id, 0);
  if (ids.length === 0 || total <= 0) return result;

  const weights = ids.map((id) => {
    const raw = params.weightsByEmployeeId?.get(id);
    return clampInt(Number(raw || 0), 0, 100000000);
  });
  const sumWeights = weights.reduce((acc, value) => acc + value, 0);

  if (sumWeights <= 0) {
    const base = Math.floor(total / ids.length);
    let remainder = total - base * ids.length;
    for (const id of ids) {
      result.set(id, base + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder -= 1;
    }
    return result;
  }

  const temp: Array<{ id: string; floor: number; fraction: number }> = [];
  let floorSum = 0;
  for (let i = 0; i < ids.length; i++) {
    const weight = weights[i];
    const exact = (total * weight) / sumWeights;
    const floor = Math.floor(exact);
    floorSum += floor;
    temp.push({ id: ids[i], floor, fraction: exact - floor });
  }

  let remainder = total - floorSum;
  temp.sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    return a.id.localeCompare(b.id);
  });

  for (const item of temp) {
    const add = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    result.set(item.id, item.floor + add);
  }

  return result;
}

export function computeVipRateioDistribution(params: {
  payments: VipRateioPaymentInput[];
  employeeIds: string[];
  setting: VipRateioSettingValue;
  othersShareByEmployeeId?: Map<string, number> | null;
}): VipRateioDistributionResult {
  const allEmployeeIds = Array.from(new Set(params.employeeIds)).sort((a, b) =>
    a.localeCompare(b)
  );
  const earningsByEmployeeId = new Map<string, number>();
  const ownPaidByEmployeeId = new Map<string, number>();

  for (const employeeId of allEmployeeIds) {
    earningsByEmployeeId.set(employeeId, 0);
    ownPaidByEmployeeId.set(employeeId, 0);
  }

  let totalPaidCents = 0;
  let totalTaxCents = 0;
  let totalNetCents = 0;
  let totalOwnerShareCents = 0;
  let totalOthersShareCents = 0;

  const normalizedShares = normalizeEmployeeShares(
    allEmployeeIds,
    params.othersShareByEmployeeId
  );

  for (const payment of params.payments) {
    const amountCents = Math.max(0, Math.trunc(Number(payment.amountCents || 0)));
    const responsibleEmployeeId = String(payment.responsibleEmployeeId || "");
    if (!responsibleEmployeeId || amountCents <= 0) continue;

    if (!earningsByEmployeeId.has(responsibleEmployeeId)) {
      earningsByEmployeeId.set(responsibleEmployeeId, 0);
      ownPaidByEmployeeId.set(responsibleEmployeeId, 0);
      normalizedShares.set(responsibleEmployeeId, 0);
    }

    totalPaidCents += amountCents;

    const taxCents = Math.round((amountCents * params.setting.taxPercentBps) / 10000);
    const netCents = Math.max(0, amountCents - taxCents);

    totalTaxCents += taxCents;
    totalNetCents += netCents;

    const othersShareCents = Math.round(
      (netCents * params.setting.othersPercentBps) / 10000
    );
    const ownerShareCents = netCents - othersShareCents;

    totalOwnerShareCents += ownerShareCents;
    totalOthersShareCents += othersShareCents;

    ownPaidByEmployeeId.set(
      responsibleEmployeeId,
      (ownPaidByEmployeeId.get(responsibleEmployeeId) || 0) + amountCents
    );

    earningsByEmployeeId.set(
      responsibleEmployeeId,
      (earningsByEmployeeId.get(responsibleEmployeeId) || 0) + ownerShareCents
    );

    const otherEmployeeIds = Array.from(earningsByEmployeeId.keys())
      .filter((id) => id !== responsibleEmployeeId)
      .sort((a, b) => a.localeCompare(b));

    if (otherEmployeeIds.length === 0) {
      earningsByEmployeeId.set(
        responsibleEmployeeId,
        (earningsByEmployeeId.get(responsibleEmployeeId) || 0) + othersShareCents
      );
      continue;
    }

    const othersSplit = splitByWeights({
      totalCents: othersShareCents,
      employeeIds: otherEmployeeIds,
      weightsByEmployeeId: normalizedShares,
    });

    for (const [employeeId, cents] of othersSplit.entries()) {
      earningsByEmployeeId.set(
        employeeId,
        (earningsByEmployeeId.get(employeeId) || 0) + cents
      );
    }
  }

  return {
    earningsByEmployeeId,
    ownPaidByEmployeeId,
    totals: {
      totalPaidCents,
      totalTaxCents,
      totalNetCents,
      totalOwnerShareCents,
      totalOthersShareCents,
    },
  };
}
