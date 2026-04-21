export const TAX_TZ = "America/Recife";

export function monthKeyTZ(date = new Date(), timeZone = TAX_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  return `${y}-${m}`; // YYYY-MM
}

export function isValidMonthKey(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

export function monthIsPayable(month: string, currentMonth: string) {
  // "YYYY-MM" funciona lexicograficamente
  return month < currentMonth;
}

export function fmtMonthPTBR(month: string) {
  const [y, m] = month.split("-");
  return `${m}/${y}`;
}
