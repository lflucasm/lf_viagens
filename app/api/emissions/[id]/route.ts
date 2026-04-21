import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer as getSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const passengersCount = body?.passengersCount;
    const note = body?.note;
    const issuedDate = body?.issuedDate;

    const data: any = {};

    if (passengersCount != null) {
      const n = Number(passengersCount);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ ok: false, error: "passengersCount inválido (>=1)." }, { status: 400 });
      }
      data.passengersCount = Math.trunc(n);
    }

    if (note !== undefined) {
      if (note === null) data.note = null;
      else if (typeof note === "string") data.note = note.trim() ? note.trim() : null;
      else data.note = null;
    }

    if (issuedDate !== undefined) {
      if (
        typeof issuedDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(issuedDate)
      ) {
        return NextResponse.json(
          { ok: false, error: "issuedDate inválida (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
      data.issuedAt = new Date(`${issuedDate}T12:00:00.000Z`);
    }

    const updated = await prisma.emissionEvent.update({
      where: { id },
      data,
      select: {
        id: true,
        cedenteId: true,
        program: true,
        passengersCount: true,
        issuedAt: true,
        source: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...updated,
        issuedAt: updated.issuedAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("EMISSION PATCH ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro inesperado" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await params;

    await prisma.emissionEvent.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("EMISSION DELETE ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro inesperado" },
      { status: 500 }
    );
  }
}
