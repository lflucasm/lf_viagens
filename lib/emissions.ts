import { LoyaltyProgram } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const EMISSION_LIMITS: Record<LoyaltyProgram, number> = {
  LATAM: 25,
  SMILES: 25,
  LIVELO: 999999, // se não usar, deixa alto
  ESFERA: 999999, // se não usar, deixa alto
};

export function toNoonSP(date: Date) {
  // fixa “meio-dia” para evitar drift de fuso
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T12:00:00-03:00`);
}

export function parseYYYYMMDDToNoonSP(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) {
    throw new Error("Data inválida (use YYYY-MM-DD)");
  }
  return new Date(`${s}T12:00:00-03:00`);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function yearWindowSP(issuedAt: Date) {
  // SMILES: zera em 01/01 (ano-calendário)
  const y = issuedAt.getFullYear();
  const start = new Date(`${y}-01-01T00:00:00-03:00`);
  const end = new Date(`${y + 1}-01-01T00:00:00-03:00`);
  return { start, end };
}

function rolling365WindowSP(issuedAt: Date) {
  // LATAM: janela móvel 365 dias até a data (inclui o dia inteiro)
  const end = addDays(issuedAt, 1); // < end inclui todos do dia
  const start = addDays(issuedAt, -365);
  return { start, end };
}

export function windowFor(program: LoyaltyProgram, issuedAt: Date) {
  if (program === "SMILES") return yearWindowSP(issuedAt);
  if (program === "LATAM") return rolling365WindowSP(issuedAt);

  // fallback: conta tudo sempre (se quiser usar depois)
  return { start: new Date("2000-01-01T00:00:00-03:00"), end: addDays(issuedAt, 1) };
}

export async function getEmissionUsage(args: {
  cedenteId: string;
  program: LoyaltyProgram;
  issuedAt: Date;
}) {
  const issuedAt = toNoonSP(args.issuedAt);
  const { start, end } = windowFor(args.program, issuedAt);

  const agg = await prisma.emissionEvent.aggregate({
    where: {
      cedenteId: args.cedenteId,
      program: args.program,
      issuedAt: { gte: start, lt: end },
    },
    _sum: { passengersCount: true },
  });

  const used = agg._sum.passengersCount ?? 0;
  const limit = EMISSION_LIMITS[args.program] ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    program: args.program,
    windowStart: start,
    windowEnd: end,
    limit,
    used,
    remaining,
  };
}
