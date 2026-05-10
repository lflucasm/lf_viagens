import { ClubBillingCycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyClubMonthlyRenewalLedger } from "@/lib/program-inventory";
import type { Program } from "@/app/api/_helpers/sales";

function recifeYmd(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    y: Number(map.year),
    m: Number(map.month),
    day: Number(map.day),
  };
}

function daysInMonth1Based(y: number, m1to12: number) {
  return new Date(y, m1to12, 0).getDate();
}

/**
 * Credita pontos e custo mensal (inventário + extrato) nas assinaturas ativas e recorrentes
 * cujo dia de renovação (America/Recife) é hoje e que ainda não renovaram neste mês.
 */
export async function runClubMonthlyRenewalCreditsAllTeams(): Promise<{
  teams: number;
  credited: number;
  errors: string[];
}> {
  const subs = await prisma.clubSubscription.findMany({
    where: {
      status: "ACTIVE",
      isRecurrent: true,
      cedente: { status: "APPROVED" },
    },
    select: {
      id: true,
      team: true,
      cedenteId: true,
      program: true,
      tierK: true,
      monthlyBonusPoints: true,
      pointsPerMonth: true,
      priceCents: true,
      billingCycle: true,
      renewalDay: true,
      lastRenewedAt: true,
    },
  });

  const { y, m, day } = recifeYmd(new Date());

  const errors: string[] = [];
  let credited = 0;
  const teams = new Set<string>();

  for (const sub of subs) {
    const rowDue = Math.min(Math.max(1, sub.renewalDay), daysInMonth1Based(y, m));
    if (day !== rowDue) continue;

    if (sub.lastRenewedAt) {
      const lr = recifeYmd(sub.lastRenewedAt);
      if (lr.y === y && lr.m === m) continue;
    }

    const pts =
      sub.pointsPerMonth != null && sub.pointsPerMonth > 0
        ? sub.pointsPerMonth
        : Math.max(0, sub.tierK * 1000 + sub.monthlyBonusPoints);

    if (pts <= 0) continue;

    const monthlyCost =
      sub.billingCycle === ClubBillingCycle.ANNUAL
        ? Math.round(safeInt(sub.priceCents) / 12)
        : safeInt(sub.priceCents);

    try {
      await prisma.$transaction((tx) =>
        applyClubMonthlyRenewalLedger(tx, {
          team: sub.team,
          cedenteId: sub.cedenteId,
          program: sub.program as Program,
          points: pts,
          costCents: monthlyCost,
          clubSubscriptionId: sub.id,
          note: `Crédito automático — renovação dia ${rowDue} (${sub.program})`,
        })
      );
      credited += 1;
      teams.add(sub.team);
    } catch (e: unknown) {
      errors.push(
        `${sub.id}: ${e instanceof Error ? e.message : "erro"}`
      );
    }
  }

  return { teams: teams.size, credited, errors };
}

function safeInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
