import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseAmountCents(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.round(input);
  }

  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function normalizeMonthRef(input: unknown) {
  if (input === undefined || input === null) return null;
  const value = String(input).trim();
  if (!value) return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function normalizeNote(input: unknown) {
  if (input === undefined || input === null) return null;
  const value = String(input).trim();
  return value ? value.slice(0, 1000) : null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do cadastro ausente." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const amountCents = parseAmountCents(body.amountCents ?? body.amount);
    const monthRef = normalizeMonthRef(body.monthRef);
    const note = normalizeNote(body.note);

    if (amountCents <= 0) {
      return NextResponse.json(
        { ok: false, error: "Valor do pagamento inválido." },
        { status: 400 }
      );
    }

    if (body.monthRef !== undefined && body.monthRef !== null && !monthRef) {
      return NextResponse.json(
        { ok: false, error: "monthRef deve estar no formato YYYY-MM." },
        { status: 400 }
      );
    }

    const lead = await prisma.vipWhatsappLead.findFirst({
      where: { id, team },
      select: { id: true, team: true, status: true },
    });

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: "Cadastro não encontrado." },
        { status: 404 }
      );
    }

    const payment = await prisma.vipWhatsappPayment.create({
      data: {
        team: lead.team,
        leadId: lead.id,
        amountCents,
        monthRef,
        note,
        recordedById: sess.id,
      },
      include: {
        recordedBy: { select: { id: true, name: true, login: true } },
      },
    });

    const agg = await prisma.vipWhatsappPayment.aggregate({
      where: { leadId: lead.id },
      _sum: { amountCents: true },
      _count: { _all: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        payment: {
          id: payment.id,
          amountCents: payment.amountCents,
          monthRef: payment.monthRef,
          note: payment.note,
          paidAt: payment.paidAt.toISOString(),
          recordedBy: payment.recordedBy
            ? {
                id: payment.recordedBy.id,
                name: payment.recordedBy.name,
                login: payment.recordedBy.login,
              }
            : null,
        },
        totals: {
          totalPaidCents: Number(agg._sum.amountCents || 0),
          paymentsCount: Number(agg._count._all || 0),
        },
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao registrar pagamento do Grupo VIP.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
