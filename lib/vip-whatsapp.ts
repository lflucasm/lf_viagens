import crypto from "crypto";

export const VIP_FIRST_MONTH_CENTS = 990;
export const VIP_RECURRING_MONTH_CENTS = 1490;

export const VIP_PIX_KEY = process.env.VIP_WHATSAPP_PIX_KEY || "63817773000185";
export const VIP_PIX_LABEL = process.env.VIP_WHATSAPP_PIX_LABEL || "Vias Aéreas (CNPJ)";

export function digitsOnly(v: string) {
  return String(v || "").replace(/\D/g, "");
}

export function toE164(countryCode: string, areaCode: string, phoneNumber: string) {
  const cc = digitsOnly(countryCode);
  const ac = digitsOnly(areaCode);
  const pn = digitsOnly(phoneNumber);
  return `+${cc}${ac}${pn}`;
}

export function formatMoneyBR(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDateBR(input: Date | string) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function nextRecurringDateFrom(adhesionDate: Date) {
  const base = new Date(adhesionDate);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  const day = base.getUTCDate();
  const recurring = new Date(Date.UTC(y, m, day, 12, 0, 0, 0));
  return recurring;
}

export function buildEmployeeWhatsappMessage(params: {
  employeeName: string;
  employeeLogin: string;
  fullName: string;
  birthDate: Date;
  whatsappE164: string;
  originAirport: string;
  destinationAirport1: string;
  destinationAirport2: string;
  destinationAirport3: string;
  adhesionDate: Date;
}) {
  const recurringDate = nextRecurringDateFrom(params.adhesionDate);
  const recurringDay = params.adhesionDate.getUTCDate();

  return [
    "NOVO CADASTRO - GRUPO VIP WHATSAPP",
    "",
    `Funcionário responsável: ${params.employeeName} (@${params.employeeLogin})`,
    `Nome: ${params.fullName}`,
    `Nascimento: ${formatDateBR(params.birthDate)}`,
    `WhatsApp: ${params.whatsappE164}`,
    `Origem: ${params.originAirport}`,
    `Destinos: ${params.destinationAirport1}, ${params.destinationAirport2}, ${params.destinationAirport3}`,
    `Data de adesão: ${formatDateBR(params.adhesionDate)}`,
    "",
    `Valor 1º mês: ${formatMoneyBR(VIP_FIRST_MONTH_CENTS)}`,
    `Mensalidade recorrente: ${formatMoneyBR(VIP_RECURRING_MONTH_CENTS)} (todo dia ${String(recurringDay).padStart(2, "0")})`,
    `Próxima recorrência: ${formatDateBR(recurringDate)}`,
    "",
    `PIX Vias Aéreas: ${VIP_PIX_KEY} - ${VIP_PIX_LABEL}`,
    "",
    "Finalizar cadastro manualmente no painel interno.",
  ].join("\n");
}

export function buildWhatsappSendUrl(e164: string, message: string) {
  const number = digitsOnly(e164);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function normalizeAirportCode(v: string) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

export function generateVipCode() {
  return crypto.randomBytes(10).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toLowerCase();
}
