import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  clubItemSlicesForAggregation,
  effectivePointsForMilheiroFromItem,
} from "@/lib/compras";
import type { LoyaltyProgram, PurchaseItemType } from "@prisma/client";

export const dynamic = "force-dynamic";

type ProgramAgg = {
  program: LoyaltyProgram;
  totalCostCents: number;
  pointsEffective: number;
  milheiroCents: number;
};

type CedenteAgg = {
  cedente: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  };
  programs: ProgramAgg[];
  totalCostCents: number;
  pointsEffective: number;
  milheiroCents: number;
};

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const items = await prisma.purchaseItem.findMany({
    where: {
      status: { not: "CANCELED" },
      type: { in: ["POINTS_BUY", "CLUB"] as PurchaseItemType[] },
      purchase: { status: { in: ["OPEN", "CLOSED"] } },
    },
    select: {
      pointsFinal: true,
      amountCents: true,
      type: true,
      details: true,
      programTo: true,
      status: true,
      purchase: {
        select: {
          cedenteId: true,
          cedente: {
            select: {
              id: true,
              nomeCompleto: true,
              cpf: true,
              identificador: true,
            },
          },
        },
      },
    },
  });

  type Cell = { cost: number; pts: number };
  const grid = new Map<string, Cell>();

  for (const it of items) {
    const cedenteId = it.purchase.cedenteId;
    const cedente = it.purchase.cedente;
    if (!cedenteId || !cedente) continue;

    if (it.type === "POINTS_BUY") {
      if (!it.programTo) continue;
      const pts = effectivePointsForMilheiroFromItem({
        type: it.type,
        pointsFinal: it.pointsFinal,
        details: it.details,
        status: it.status,
      });
      const cost = Number(it.amountCents || 0);
      if (pts <= 0 && cost <= 0) continue;
      const k = `${cedenteId}|||${it.programTo}`;
      const cur = grid.get(k) || { cost: 0, pts: 0 };
      cur.cost += cost;
      cur.pts += pts;
      grid.set(k, cur);
      continue;
    }

    if (it.type === "CLUB") {
      const slices = clubItemSlicesForAggregation({
        type: "CLUB",
        pointsFinal: it.pointsFinal,
        details: it.details,
        amountCents: it.amountCents,
        status: it.status,
        programTo: it.programTo,
      });
      for (const sl of slices) {
        const k = `${cedenteId}|||${sl.program}`;
        const cur = grid.get(k) || { cost: 0, pts: 0 };
        cur.cost += sl.costCents;
        cur.pts += sl.points;
        grid.set(k, cur);
      }
    }
  }

  const byCedente = new Map<string, CedenteAgg>();

  for (const [k, cell] of grid) {
    const [cedenteId, prog] = k.split("|||") as [string, LoyaltyProgram];
    const sample = items.find((i) => i.purchase.cedenteId === cedenteId)?.purchase.cedente;
    if (!sample) continue;

    const milheiroCents = cell.pts > 0 && cell.cost > 0 ? Math.round((cell.cost * 1000) / cell.pts) : 0;
    const pa: ProgramAgg = {
      program: prog,
      totalCostCents: cell.cost,
      pointsEffective: cell.pts,
      milheiroCents,
    };

    if (!byCedente.has(cedenteId)) {
      byCedente.set(cedenteId, {
        cedente: {
          id: sample.id,
          nomeCompleto: sample.nomeCompleto,
          cpf: sample.cpf,
          identificador: sample.identificador,
        },
        programs: [],
        totalCostCents: 0,
        pointsEffective: 0,
        milheiroCents: 0,
      });
    }
    const row = byCedente.get(cedenteId)!;
    row.programs.push(pa);
    row.totalCostCents += cell.cost;
    row.pointsEffective += cell.pts;
  }

  const cedentes: CedenteAgg[] = [...byCedente.values()].map((row) => {
    const milheiroCents =
      row.pointsEffective > 0 && row.totalCostCents > 0
        ? Math.round((row.totalCostCents * 1000) / row.pointsEffective)
        : 0;
    row.programs.sort((a, b) => a.program.localeCompare(b.program));
    return { ...row, milheiroCents };
  });

  cedentes.sort((a, b) => a.cedente.nomeCompleto.localeCompare(b.cedente.nomeCompleto, "pt-BR"));

  let grandCost = 0;
  let grandPts = 0;
  for (const c of cedentes) {
    grandCost += c.totalCostCents;
    grandPts += c.pointsEffective;
  }
  const grandMilheiroCents =
    grandPts > 0 && grandCost > 0 ? Math.round((grandCost * 1000) / grandPts) : 0;

  return NextResponse.json({
    ok: true,
    cedentes,
    grandTotalCostCents: grandCost,
    grandPointsEffective: grandPts,
    grandMilheiroCents,
  });
}
