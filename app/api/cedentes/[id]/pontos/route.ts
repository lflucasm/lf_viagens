import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAM_FIELD: Record<
  string,
  "pontosLatam" | "pontosSmiles" | "pontosLivelo" | "pontosEsfera"
> = {
  LATAM: "pontosLatam",
  SMILES: "pontosSmiles",
  LIVELO: "pontosLivelo",
  ESFERA: "pontosEsfera",
};

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // ✅ Next 16 espera params como Promise

  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const program = String(body.program || "").toUpperCase();
  const field = PROGRAM_FIELD[program];
  if (!field) return bad("Programa inválido");

  const points = safeInt(body.points, NaN);
  if (!Number.isFinite(points) || points < 0) return bad("Pontos inválidos");

  try {
    const ced = await prisma.cedente.findFirst({
      where: { id, owner: { team: session.team } },
      select: { id: true },
    });
    if (!ced) return bad("Cedente não encontrado", 404);

    const updated = await prisma.cedente.update({
      where: { id },
      data: { [field]: points } as any,
      select: {
        id: true,
        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,
      },
    });

    return NextResponse.json({
      ok: true,
      id: updated.id,
      program,
      points: (updated as any)[field],
    });
  } catch (e) {
    return bad("Falha ao processar no banco.", 500);
  }
}
