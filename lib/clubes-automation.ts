// lib/clubes-automation.ts
import { prisma } from "@/lib/prisma";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Status = "ACTIVE" | "PAUSED" | "CANCELED";

function startUTC(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function addDaysUTC(d: Date, days: number) {
  const x = startUTC(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function daysInMonthUTC(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function dateUTC(y: number, m: number, day: number) {
  return new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
}
function clampDay(n: number) {
  return Math.min(31, Math.max(1, Math.trunc(n || 1)));
}

/**
 * ✅ REGRA FINAL:
 * - LATAM e SMILES: cobrança SEMPRE no mês seguinte, no renewalDay (clamp no último dia do mês)
 * - LIVELO: PAUSED exatamente 30 dias após assinatura
 * - ESFERA: manual
 */
function nextMonthlyDue(base: Date, renewalDay: number) {
  const b = startUTC(base);
  const y = b.getUTCFullYear();
  const m = b.getUTCMonth();
  const day = clampDay(renewalDay);

  const nm = m + 1;
  const ny = y + Math.floor(nm / 12);
  const mm = ((nm % 12) + 12) % 12;

  const nextDay = Math.min(day, daysInMonthUTC(ny, mm));
  return dateUTC(ny, mm, nextDay);
}

function downgradeOnly(curr: Status, next: Status) {
  const sev: Record<Status, number> = { ACTIVE: 0, PAUSED: 1, CANCELED: 2 };
  return sev[next] > sev[curr] ? next : curr;
}

function computeStatus(row: {
  program: Program;
  status: Status;
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
}) {
  const now = startUTC(new Date());

  const program = row.program;
  const curr = row.status as Status;

  // nunca “des-cancela”
  if (curr === "CANCELED") {
    return { status: "CANCELED" as Status, cancelAt: null as Date | null };
  }

  const sub = startUTC(row.subscribedAt);
  const last = row.lastRenewedAt ? startUTC(row.lastRenewedAt) : null;

  // ✅ LIVELO: PAUSED exatamente D+30 (sem +1)
  if (program === "LIVELO") {
    const inactiveAt = addDaysUTC(sub, 30);

    if (now >= inactiveAt) {
      // downgrade-only: ACTIVE -> PAUSED; PAUSED fica PAUSED
      return { status: downgradeOnly(curr, "PAUSED"), cancelAt: null };
    }
    // não sobe de PAUSED -> ACTIVE automaticamente
    return { status: curr, cancelAt: null };
  }

  // ✅ LATAM / SMILES: SEMPRE mês seguinte, e escolhe o renewalDay
  if (program === "LATAM" || program === "SMILES") {
    const base = last ?? sub;

    const due = nextMonthlyDue(base, row.renewalDay);
    const inactiveAt = addDaysUTC(due, 1);

    const graceDays = program === "LATAM" ? 10 : 60;
    const cancelAt = addDaysUTC(inactiveAt, graceDays);

    // se já passou do cancelAt => CANCELED
    if (now >= cancelAt) {
      return { status: "CANCELED" as Status, cancelAt };
    }

    // se passou do inactiveAt => PAUSED (downgrade-only)
    if (now >= inactiveAt) {
      return { status: downgradeOnly(curr, "PAUSED"), cancelAt };
    }

    // antes do atraso: mantém status atual (não reativa automaticamente)
    return { status: curr, cancelAt: null };
  }

  // ✅ ESFERA: manual
  return { status: curr, cancelAt: null };
}

export async function autoUpdateClubStatuses(team: string) {
  const rows = await prisma.clubSubscription.findMany({
    where: { team, status: { not: "CANCELED" as any } },
    select: {
      id: true,
      program: true,
      status: true,
      subscribedAt: true,
      renewalDay: true,
      lastRenewedAt: true,
    },
  });

  const ops: any[] = [];

  for (const r of rows) {
    const program = String(r.program) as Program;
    const status = String(r.status) as Status;

    const { status: nextStatus } = computeStatus({
      program,
      status,
      subscribedAt: r.subscribedAt,
      renewalDay: r.renewalDay,
      lastRenewedAt: r.lastRenewedAt,
    });

    if (nextStatus !== status) {
      ops.push(
        prisma.clubSubscription.update({
          where: { id: r.id },
          data: { status: nextStatus as any, pointsExpireAt: null as any }, // você disse que não usa expiração
        })
      );
    }
  }

  // evita transação gigante
  const CHUNK = 200;
  for (let i = 0; i < ops.length; i += CHUNK) {
    await prisma.$transaction(ops.slice(i, i + CHUNK));
  }

  return { changed: ops.length };
}
