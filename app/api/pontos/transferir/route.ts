import { prisma } from "@/lib/prisma";
import { badRequest, ok, serverError, unauthorized } from "@/lib/api";
import { getSessionServer } from "@/lib/auth-server";
import { CANONICAL_OPERATION_TEAM } from "@/lib/canonical-team";
import {
  applyProgramTransfer,
  isAllowedTransfer,
} from "@/lib/program-inventory";
import type { Program } from "@/app/api/_helpers/sales";

export const dynamic = "force-dynamic";

const PROGRAMS = new Set<Program>(["LATAM", "SMILES", "LIVELO", "ESFERA"]);

function normProgram(v: unknown): Program | null {
  const s = String(v || "").trim().toUpperCase();
  return PROGRAMS.has(s as Program) ? (s as Program) : null;
}

export async function POST(req: Request) {
  try {
    const session = await getSessionServer();
    if (!session?.id) {
      return unauthorized("Faça login novamente.");
    }

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const cedenteId = String(body.cedenteId || "").trim();
    const from = normProgram(body.programFrom);
    const to = normProgram(body.programTo);
    const points = Math.trunc(Number(body.points || 0));
    const bonusPoints = Math.max(0, Math.trunc(Number(body.bonusPoints || 0)));
    const note = body.note != null ? String(body.note).trim() || null : null;

    if (!cedenteId) return badRequest("Cedente é obrigatório.");
    if (!from || !to) return badRequest("Programas de origem e destino são obrigatórios.");
    if (!isAllowedTransfer(from, to)) {
      return badRequest(
        "Transferência permitida apenas de LIVELO ou ESFERA para LATAM ou SMILES."
      );
    }
    if (points <= 0) return badRequest("Informe a quantidade de pontos.");

    const ced = await prisma.cedente.findFirst({
      where: { id: cedenteId },
      select: { id: true, status: true },
    });
    if (!ced) return badRequest("Cedente não encontrado.");
    if (ced.status !== "APPROVED") {
      return badRequest("Cedente precisa estar aprovado.");
    }

    await prisma.$transaction(async (tx) => {
      await applyProgramTransfer(tx, {
        team: CANONICAL_OPERATION_TEAM,
        cedenteId,
        from,
        to,
        points,
        bonusPoints: bonusPoints || undefined,
        note,
      });
    });

    return ok({ message: "Transferência registrada." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return serverError("Falha na transferência.", { detail: msg });
  }
}
