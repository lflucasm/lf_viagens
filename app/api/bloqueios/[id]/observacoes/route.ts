import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const text = String(body?.text || "").trim();

    if (!text) return NextResponse.json({ ok: false, error: "Digite a observação/protocolo." }, { status: 400 });

    // (opcional) createdById via sessão
    const createdById = null;

    const obs = await prisma.blockObservation.create({
      data: {
        blockedId: id,
        text,
        createdById,
      },
    });

    return NextResponse.json(
      { ok: true, data: { id: obs.id, createdAt: obs.createdAt.toISOString() } },
      { status: 201 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro." }, { status: 500 });
  }
}
