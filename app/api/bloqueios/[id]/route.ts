import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  status?: "OPEN" | "UNBLOCKED" | "CANCELED";
  resolvedAt?: string | null; // opcional
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido." },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;

    // ✅ Se não vier status, padrão: UNBLOCKED (desbloqueio manual)
    const nextStatus =
      body.status && ["OPEN", "UNBLOCKED", "CANCELED"].includes(body.status)
        ? body.status
        : "UNBLOCKED";

    const resolvedAt =
      nextStatus === "UNBLOCKED"
        ? body.resolvedAt
          ? new Date(body.resolvedAt)
          : new Date()
        : null;

    const updated = await prisma.blockedAccount.update({
      where: { id },
      data: {
        status: nextStatus as any,
        resolvedAt,
      },
      select: {
        id: true,
        status: true,
        resolvedAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro." },
      { status: 500 }
    );
  }
}
