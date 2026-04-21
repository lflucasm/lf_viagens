import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

const EMPTY_CREDITOR_KEY = "__SEM_PESSOA__";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const rawGroupKey = String(body?.groupKey || "").trim();
    const note = String(body?.note || "").trim() || "Quitação em lote por credor";

    if (!rawGroupKey) {
      return NextResponse.json({ ok: false, error: "Credor não informado." }, { status: 400 });
    }

    const where =
      rawGroupKey === EMPTY_CREDITOR_KEY
        ? {
            status: "OPEN" as const,
            OR: [{ creditorName: null }, { creditorName: "" }],
          }
        : {
            status: "OPEN" as const,
            creditorName: rawGroupKey,
          };

    const debts = await prisma.debt.findMany({
      where,
      include: {
        payments: {
          select: { amountCents: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!debts.length) {
      return NextResponse.json({ ok: false, error: "Nenhuma dívida aberta encontrada para esse credor." }, { status: 404 });
    }

    const actionable = debts
      .map((debt) => {
        const paidCents = debt.payments.reduce((sum, payment) => sum + safeInt(payment.amountCents), 0);
        const balanceCents = Math.max(0, safeInt(debt.totalCents) - paidCents);
        return {
          id: debt.id,
          balanceCents,
        };
      })
      .filter((debt) => debt.balanceCents > 0);

    if (!actionable.length) {
      return NextResponse.json({ ok: false, error: "Esse credor não possui saldo pendente." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const debt of actionable) {
        await tx.debtPayment.create({
          data: {
            debtId: debt.id,
            amountCents: debt.balanceCents,
            note,
          },
        });

        await tx.debt.update({
          where: { id: debt.id },
          data: { status: "PAID" },
        });
      }
    });

    const totalPaidCents = actionable.reduce((sum, debt) => sum + debt.balanceCents, 0);

    return NextResponse.json({
      ok: true,
      data: {
        debtsCount: actionable.length,
        totalPaidCents,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao quitar dívidas do credor." },
      { status: 500 }
    );
  }
}
