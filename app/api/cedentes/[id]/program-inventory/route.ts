import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { avgMilheiroFromInventory } from "@/lib/program-inventory";
import type { Program } from "@/app/api/_helpers/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS: Program[] = ["LATAM", "SMILES", "LIVELO", "ESFERA"];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function fallbackMilheiro(
  program: Program,
  s: { latamRateCents: number; smilesRateCents: number; liveloRateCents: number; esferaRateCents: number } | null
) {
  if (!s) {
    if (program === "LATAM") return 2000;
    if (program === "SMILES") return 1800;
    if (program === "LIVELO") return 2200;
    return 1700;
  }
  if (program === "LATAM") return s.latamRateCents;
  if (program === "SMILES") return s.smilesRateCents;
  if (program === "LIVELO") return s.liveloRateCents;
  return s.esferaRateCents;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cedenteId } = await params;

  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const cedente = await prisma.cedente.findFirst({
    where: { id: cedenteId, owner: { team: session.team } },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      pontosLatam: true,
      pontosSmiles: true,
      pontosLivelo: true,
      pontosEsfera: true,
    },
  });

  if (!cedente) return bad("Cedente não encontrado.", 404);

  const settings = await prisma.settings.findFirst({});
  const inventories = await prisma.cedenteProgramInventory.findMany({
    where: { cedenteId },
  });
  const byProg = new Map(inventories.map((i) => [i.program, i]));

  const rows = PROGRAMS.map((program) => {
    const pts =
      program === "LATAM"
        ? cedente.pontosLatam
        : program === "SMILES"
          ? cedente.pontosSmiles
          : program === "LIVELO"
            ? cedente.pontosLivelo
            : cedente.pontosEsfera;

    const inv = byProg.get(program);
    const avgFromInv =
      inv && inv.pointsBalance > 0 ? avgMilheiroFromInventory(inv.pointsBalance, inv.costBasisCents) : null;

    const fallback = fallbackMilheiro(program, settings);

    return {
      program,
      cedentePoints: pts,
      inventoryPoints: inv?.pointsBalance ?? 0,
      costBasisCents: inv?.costBasisCents ?? 0,
      avgMilheiroCents: avgFromInv && avgFromInv > 0 ? avgFromInv : fallback,
      usesInventoryAvg: !!(avgFromInv && avgFromInv > 0),
    };
  });

  return NextResponse.json({ ok: true, cedenteId, items: rows });
}
