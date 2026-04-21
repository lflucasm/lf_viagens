import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: receivableId } = await params;
    const body = await req.json();

    const amountStr = String(body?.amount || "").trim();
    const note = String(body?.note || "").trim() || null;

    const amountCents = toCentsFromInput(amountStr);
    if (amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Valor inválido" }, { status: 400 });
    }

    const receivable = await prisma.receivable.findUnique({
      where: { id: receivableId },
    });

    if (!receivable) {
      return NextResponse.json({ ok: false, error: "Recebimento não encontrado" }, { status: 404 });
    }

    if (receivable.status === "CANCELED") {
      return NextResponse.json({ ok: false, error: "Recebimento cancelado" }, { status: 400 });
    }

    const nextReceived = (receivable.receivedCents || 0) + amountCents;
    const nextBalance = Math.max(0, (receivable.totalCents || 0) - nextReceived);
    const nextStatus = nextBalance === 0 ? "RECEIVED" : "OPEN";

    const created = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: { receivableId, amountCents, note },
      });

      await tx.receivable.update({
        where: { id: receivableId },
        data: {
          receivedCents: nextReceived,
          balanceCents: nextBalance,
          status: nextStatus,
        },
      });

      return receipt;
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro" },
      { status: 500 }
    );
  }
}
