import type { Prisma } from "@prisma/client";
import { ProgramLedgerKind } from "@prisma/client";
import { pointsField, type Program } from "@/app/api/_helpers/sales";

/** Milheiro médio (centavos por 1k pts) a partir do inventário; null se indefinido. */
export function avgMilheiroFromInventory(pointsBalance: number, costBasisCents: number): number | null {
  if (pointsBalance <= 0) return null;
  return Math.round((costBasisCents * 1000) / pointsBalance);
}

export async function getAvgCostMilheiroCentsForSale(
  tx: Prisma.TransactionClient,
  cedenteId: string,
  program: Program,
  fallbackCents: number
): Promise<number> {
  const inv = await tx.cedenteProgramInventory.findUnique({
    where: { cedenteId_program: { cedenteId, program } },
  });
  if (!inv || inv.pointsBalance <= 0) return fallbackCents;
  const avg = avgMilheiroFromInventory(inv.pointsBalance, inv.costBasisCents);
  return avg != null && avg > 0 ? avg : fallbackCents;
}

/**
 * Após a venda já ter decrementado o saldo do cedente: alinha inventário e grava extrato SALE.
 */
export async function deductInventoryOnSale(
  tx: Prisma.TransactionClient,
  args: {
    team: string;
    cedenteId: string;
    program: Program;
    pointsSold: number;
    note?: string | null;
  }
) {
  const { team, cedenteId, program, pointsSold } = args;
  if (pointsSold <= 0) return;

  const field = pointsField(program);
  const ced = await tx.cedente.findUnique({
    where: { id: cedenteId },
    select: { id: true, pontosLatam: true, pontosSmiles: true, pontosLivelo: true, pontosEsfera: true },
  });
  if (!ced) return;

  const balanceAfter =
    program === "LATAM"
      ? ced.pontosLatam
      : program === "SMILES"
        ? ced.pontosSmiles
        : program === "LIVELO"
          ? ced.pontosLivelo
          : ced.pontosEsfera;

  const balanceBefore = balanceAfter + pointsSold;

  let inv = await tx.cedenteProgramInventory.findUnique({
    where: { cedenteId_program: { cedenteId, program } },
  });

  if (!inv) {
    inv = await tx.cedenteProgramInventory.create({
      data: {
        team,
        cedenteId,
        program,
        pointsBalance: balanceBefore,
        costBasisCents: 0,
      },
    });
  }

  const P = Math.max(balanceBefore, 1);
  const C = inv.costBasisCents;
  const s = pointsSold;
  const costOut = Math.round((C * s) / P);

  await tx.cedenteProgramInventory.update({
    where: { cedenteId_program: { cedenteId, program } },
    data: {
      pointsBalance: Math.max(0, balanceAfter),
      costBasisCents: Math.max(0, C - costOut),
    },
  });

  await tx.cedenteProgramLedgerEntry.create({
    data: {
      team,
      cedenteId,
      program,
      kind: ProgramLedgerKind.SALE,
      pointsDelta: -s,
      costDeltaCents: -costOut,
      note: args.note ?? null,
    },
  });
}

/** Compra direta de pontos por programa (fora do fluxo Purchase), com bônus opcional sem custo. */
export async function applyPointsPurchaseLedger(
  tx: Prisma.TransactionClient,
  args: {
    team: string;
    cedenteId: string;
    program: Program;
    points: number;
    totalCostCents: number;
    bonusPoints?: number;
    note?: string | null;
  }
) {
  const points = Math.max(0, Math.trunc(args.points));
  const bonus = Math.max(0, Math.trunc(args.bonusPoints ?? 0));
  const totalPts = points + bonus;
  if (totalPts <= 0) throw new Error("Informe pontos ou bônus.");

  const field = pointsField(args.program);

  await tx.cedente.update({
    where: { id: args.cedenteId },
    data: { [field]: { increment: totalPts } } as Prisma.CedenteUpdateInput,
  });

  const ced = await tx.cedente.findUnique({
    where: { id: args.cedenteId },
    select: { pontosLatam: true, pontosSmiles: true, pontosLivelo: true, pontosEsfera: true },
  });
  if (!ced) throw new Error("Cedente não encontrado.");

  const newBalance =
    args.program === "LATAM"
      ? ced.pontosLatam
      : args.program === "SMILES"
        ? ced.pontosSmiles
        : args.program === "LIVELO"
          ? ced.pontosLivelo
          : ced.pontosEsfera;

  const inv = await tx.cedenteProgramInventory.findUnique({
    where: { cedenteId_program: { cedenteId: args.cedenteId, program: args.program } },
  });

  const addCost = Math.max(0, Math.trunc(args.totalCostCents));

  if (!inv) {
    await tx.cedenteProgramInventory.create({
      data: {
        team: args.team,
        cedenteId: args.cedenteId,
        program: args.program,
        pointsBalance: newBalance,
        costBasisCents: addCost,
      },
    });
  } else {
    await tx.cedenteProgramInventory.update({
      where: { cedenteId_program: { cedenteId: args.cedenteId, program: args.program } },
      data: {
        pointsBalance: newBalance,
        costBasisCents: Math.max(0, inv.costBasisCents + addCost),
      },
    });
  }

  const kind =
    points > 0 ? ProgramLedgerKind.POINTS_PURCHASE : ProgramLedgerKind.BONUS;

  await tx.cedenteProgramLedgerEntry.create({
    data: {
      team: args.team,
      cedenteId: args.cedenteId,
      program: args.program,
      kind,
      pointsDelta: totalPts,
      costDeltaCents: addCost,
      bonusPoints: bonus,
      note: args.note ?? null,
    },
  });
}

/** Crédito automático na renovação do clube (cron): pontos + custo mensal no inventário/extrato. */
export async function applyClubMonthlyRenewalLedger(
  tx: Prisma.TransactionClient,
  args: {
    team: string;
    cedenteId: string;
    program: Program;
    points: number;
    costCents: number;
    clubSubscriptionId: string;
    note?: string | null;
  }
) {
  const pts = Math.max(0, Math.trunc(args.points));
  const cost = Math.max(0, Math.trunc(args.costCents));
  if (pts <= 0) return;

  const field = pointsField(args.program);

  await tx.cedente.update({
    where: { id: args.cedenteId },
    data: { [field]: { increment: pts } } as Prisma.CedenteUpdateInput,
  });

  const ced = await tx.cedente.findUnique({
    where: { id: args.cedenteId },
    select: { pontosLatam: true, pontosSmiles: true, pontosLivelo: true, pontosEsfera: true },
  });
  if (!ced) throw new Error("Cedente não encontrado.");

  const newBalance =
    args.program === "LATAM"
      ? ced.pontosLatam
      : args.program === "SMILES"
        ? ced.pontosSmiles
        : args.program === "LIVELO"
          ? ced.pontosLivelo
          : ced.pontosEsfera;

  const inv = await tx.cedenteProgramInventory.findUnique({
    where: { cedenteId_program: { cedenteId: args.cedenteId, program: args.program } },
  });

  if (!inv) {
    await tx.cedenteProgramInventory.create({
      data: {
        team: args.team,
        cedenteId: args.cedenteId,
        program: args.program,
        pointsBalance: newBalance,
        costBasisCents: cost,
      },
    });
  } else {
    await tx.cedenteProgramInventory.update({
      where: { cedenteId_program: { cedenteId: args.cedenteId, program: args.program } },
      data: {
        pointsBalance: newBalance,
        costBasisCents: Math.max(0, inv.costBasisCents + cost),
      },
    });
  }

  await tx.cedenteProgramLedgerEntry.create({
    data: {
      team: args.team,
      cedenteId: args.cedenteId,
      program: args.program,
      kind: ProgramLedgerKind.CLUB_MONTHLY_CREDIT,
      pointsDelta: pts,
      costDeltaCents: cost,
      note:
        args.note ??
        `Renovação clube (${args.clubSubscriptionId.slice(0, 8)}…)`,
    },
  });

  await tx.clubSubscription.update({
    where: { id: args.clubSubscriptionId },
    data: {
      lastRenewedAt: new Date(),
      renewedThisCycle: true,
    },
  });
}

const TRANSFER_FROM: Record<string, Program[]> = {
  LIVELO: ["LATAM", "SMILES"],
  ESFERA: ["LATAM", "SMILES"],
};

export function isAllowedTransfer(from: Program, to: Program) {
  const ok = TRANSFER_FROM[from];
  return Array.isArray(ok) && ok.includes(to);
}

/**
 * Transferência LIVELO/ESFERA → LATAM/SMILES: custo proporcional ao saldo de origem;
 * bônus no destino dilui o milheiro médio (custo fixo / mais pontos).
 */
export async function applyProgramTransfer(
  tx: Prisma.TransactionClient,
  args: {
    team: string;
    cedenteId: string;
    from: Program;
    to: Program;
    points: number;
    bonusPoints?: number;
    note?: string | null;
  }
) {
  const { team, cedenteId, from, to } = args;
  const pts = Math.max(0, Math.trunc(args.points));
  const bonus = Math.max(0, Math.trunc(args.bonusPoints ?? 0));
  if (!isAllowedTransfer(from, to)) {
    throw new Error("Transferência permitida apenas de LIVELO ou ESFERA para LATAM ou SMILES.");
  }
  if (pts <= 0) throw new Error("Informe os pontos a transferir.");

  const fField = pointsField(from);
  const tField = pointsField(to);

  const ced0 = await tx.cedente.findUnique({
    where: { id: cedenteId },
    select: { pontosLatam: true, pontosSmiles: true, pontosLivelo: true, pontosEsfera: true },
  });
  if (!ced0) throw new Error("Cedente não encontrado.");

  const balFromBefore =
    from === "LATAM"
      ? ced0.pontosLatam
      : from === "SMILES"
        ? ced0.pontosSmiles
        : from === "LIVELO"
          ? ced0.pontosLivelo
          : ced0.pontosEsfera;

  if (balFromBefore < pts) throw new Error("Pontos insuficientes na origem.");

  let invFrom = await tx.cedenteProgramInventory.findUnique({
    where: { cedenteId_program: { cedenteId, program: from } },
  });
  if (!invFrom) {
    invFrom = await tx.cedenteProgramInventory.create({
      data: {
        team,
        cedenteId,
        program: from,
        pointsBalance: balFromBefore,
        costBasisCents: 0,
      },
    });
  }

  const P = Math.max(balFromBefore, invFrom.pointsBalance, 1);
  const C = invFrom.costBasisCents;
  const costMove = Math.round((C * pts) / P);

  await tx.cedente.update({
    where: { id: cedenteId },
    data: {
      [fField]: { decrement: pts },
      [tField]: { increment: pts + bonus },
    } as Prisma.CedenteUpdateInput,
  });

  await tx.cedenteProgramInventory.update({
    where: { cedenteId_program: { cedenteId, program: from } },
    data: {
      pointsBalance: balFromBefore - pts,
      costBasisCents: Math.max(0, C - costMove),
    },
  });

  const ced1 = await tx.cedente.findUnique({
    where: { id: cedenteId },
    select: { pontosLatam: true, pontosSmiles: true, pontosLivelo: true, pontosEsfera: true },
  });
  if (!ced1) throw new Error("Cedente não encontrado.");

  const balToAfter =
    to === "LATAM"
      ? ced1.pontosLatam
      : to === "SMILES"
        ? ced1.pontosSmiles
        : to === "LIVELO"
          ? ced1.pontosLivelo
          : ced1.pontosEsfera;

  let invTo = await tx.cedenteProgramInventory.findUnique({
    where: { cedenteId_program: { cedenteId, program: to } },
  });
  if (!invTo) {
    await tx.cedenteProgramInventory.create({
      data: {
        team,
        cedenteId,
        program: to,
        pointsBalance: balToAfter,
        costBasisCents: costMove,
      },
    });
  } else {
    await tx.cedenteProgramInventory.update({
      where: { cedenteId_program: { cedenteId, program: to } },
      data: {
        pointsBalance: balToAfter,
        costBasisCents: Math.max(0, invTo.costBasisCents + costMove),
      },
    });
  }

  await tx.cedenteProgramLedgerEntry.create({
    data: {
      team,
      cedenteId,
      program: from,
      kind: ProgramLedgerKind.TRANSFER_OUT,
      pointsDelta: -pts,
      costDeltaCents: -costMove,
      peerProgram: to,
      bonusPoints: 0,
      note: args.note ?? null,
    },
  });

  await tx.cedenteProgramLedgerEntry.create({
    data: {
      team,
      cedenteId,
      program: to,
      kind: ProgramLedgerKind.TRANSFER_IN,
      pointsDelta: pts + bonus,
      costDeltaCents: costMove,
      peerProgram: from,
      bonusPoints: bonus,
      note: args.note ?? null,
    },
  });
}
