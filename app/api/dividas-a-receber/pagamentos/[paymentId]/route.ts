import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { computeStatus } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ paymentId: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await requireSession();
  const { paymentId } = await params;

  const paymentIdStr = String(paymentId || "");

  const payment = await prisma.dividaAReceberPagamento.findUnique({
    where: { id: paymentIdStr },
    select: { id: true, dividaId: true },
  });
  if (!payment)
    return NextResponse.json(
      { ok: false, error: "Pagamento não encontrado." },
      { status: 404 }
    );

  // garante que a dívida é do team do usuário
  const parent = await prisma.dividaAReceber.findFirst({
    where: { id: payment.dividaId, team: session.team },
    select: { id: true, totalCents: true, status: true },
  });
  if (!parent)
    return NextResponse.json({ ok: false, error: "Sem acesso." }, { status: 403 });

  const result = await prisma.$transaction(async (tx) => {
    await tx.dividaAReceberPagamento.delete({ where: { id: paymentIdStr } });

    const agg = await tx.dividaAReceberPagamento.aggregate({
      where: { dividaId: parent.id },
      _sum: { amountCents: true },
    });
    const receivedCents = agg._sum.amountCents || 0;

    const status =
      parent.status === "CANCELED"
        ? "CANCELED"
        : computeStatus(parent.totalCents, receivedCents);

    const updated = await tx.dividaAReceber.update({
      where: { id: parent.id },
      data: { receivedCents, status },
    });

    return { updated };
  });

  return NextResponse.json({ ok: true, ...result });
}
