import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: noCacheHeaders() });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const team = session?.team;
    const userId = session?.id;
    if (!team || !userId) return bad("Sessão inválida.", 401);

    const { id } = await ctx.params;
    const saleId = String(id || "").trim();
    if (!saleId) return bad("ID inválido.");

    const existing = await prisma.consolidatorSale.findFirst({
      where: { id: saleId, team },
      select: { id: true, status: true },
    });

    if (!existing) return bad("Registro não encontrado.", 404);
    if (existing.status !== "AWAITING_CONSOLIDATOR_PAYMENT") {
      return bad("Este registro já foi liberado.");
    }

    const updated = await prisma.consolidatorSale.update({
      where: { id: saleId },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        releasedById: userId,
      },
      select: {
        id: true,
        consolidatorName: true,
        clientName: true,
        totalCents: true,
        commissionCents: true,
        commissionBps: true,
        status: true,
        releasedAt: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true, login: true } },
        releasedBy: { select: { id: true, name: true, login: true } },
      },
    });

    return ok({
      row: {
        id: updated.id,
        consolidatorName: updated.consolidatorName,
        clientName: updated.clientName,
        totalCents: updated.totalCents,
        commissionCents: updated.commissionCents,
        commissionBps: updated.commissionBps,
        status: updated.status,
        releasedAt: updated.releasedAt?.toISOString() ?? null,
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        createdBy: updated.createdBy,
        releasedBy: updated.releasedBy,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao liberar registro.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}
