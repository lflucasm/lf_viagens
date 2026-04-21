// app/api/dividas/[id]/pagamentos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCentsFromInput(s: any) {
  const cleaned = String(s ?? "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function safeInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// ✅ Next 16: params vem como Promise
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID da dívida ausente." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({} as any));

    // ✅ teu frontend manda "amount" (string)
    const amountCents = toCentsFromInput(body?.amount);
    const note = typeof body?.note === "string" ? body.note.trim() : null;

    if (amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Pagamento inválido." }, { status: 400 });
    }

    const debt = await prisma.debt.findUnique({
      where: { id },
      select: { id: true, totalCents: true, status: true },
    });

    if (!debt) {
      return NextResponse.json({ ok: false, error: "Dívida não encontrada." }, { status: 404 });
    }
    if (debt.status === "CANCELED") {
      return NextResponse.json({ ok: false, error: "Dívida cancelada." }, { status: 400 });
    }

    await prisma.debtPayment.create({
      data: {
        debtId: id,
        amountCents,
        note: note || null,
        // paidAt já é default(now())
      },
    });

    // recalcula saldo
    const agg = await prisma.debtPayment.aggregate({
      where: { debtId: id },
      _sum: { amountCents: true },
    });

    const paidCents = safeInt(agg._sum.amountCents);
    const balanceCents = Math.max(0, safeInt(debt.totalCents) - paidCents);

    // marca como PAID se quitou
    if (debt.status === "OPEN" && balanceCents === 0) {
      await prisma.debt.update({ where: { id }, data: { status: "PAID" } });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao registrar pagamento." },
      { status: 500 }
    );
  }
}
