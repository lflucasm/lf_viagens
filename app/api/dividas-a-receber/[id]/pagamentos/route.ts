import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { computeStatus } from "../../route";
import { ReceberMetodo } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function normalizeText(v: unknown, max = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}
function parseDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const METHODS = [
  "PIX",
  "CARTAO",
  "BOLETO",
  "DINHEIRO",
  "TRANSFERENCIA",
  "OUTRO",
] as const;

type MethodStr = (typeof METHODS)[number];

function parseMethod(v: unknown): ReceberMetodo {
  const raw = String(v ?? "PIX").toUpperCase();
  const normalized = METHODS.includes(raw as MethodStr)
    ? (raw as MethodStr)
    : "PIX";
  return normalized as ReceberMetodo;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await requireSession();
  const { id } = await params;

  const row = await prisma.dividaAReceber.findFirst({
    where: { id: String(id || ""), team: session.team },
    include: { payments: { orderBy: { receivedAt: "desc" } } },
  });

  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Não encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, row });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await requireSession();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));

  const parent = await prisma.dividaAReceber.findFirst({
    where: { id: String(id || ""), team: session.team },
    select: { id: true, totalCents: true, status: true },
  });

  if (!parent) {
    return NextResponse.json(
      { ok: false, error: "Não encontrado." },
      { status: 404 }
    );
  }

  if (parent.status === "CANCELED") {
    return NextResponse.json(
      {
        ok: false,
        error: "Registro cancelado. Reative para lançar recebimento.",
      },
      { status: 400 }
    );
  }

  const amountCents = safeInt(body.amountCents, 0);
  if (amountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "Valor precisa ser maior que 0." },
      { status: 400 }
    );
  }

  const methodFinal = parseMethod(body.method);
  const receivedAt = parseDate(body.receivedAt) || new Date();
  const note = normalizeText(body.note, 1000) || null;

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.dividaAReceberPagamento.create({
      data: {
        dividaId: String(id || ""),
        amountCents,
        method: methodFinal,
        receivedAt,
        note,
      },
    });

    const agg = await tx.dividaAReceberPagamento.aggregate({
      where: { dividaId: String(id || "") },
      _sum: { amountCents: true },
    });

    const receivedCents = agg._sum.amountCents || 0;

    const status =
      parent.status === "CANCELED"
        ? "CANCELED"
        : computeStatus(parent.totalCents, receivedCents);

    const updated = await tx.dividaAReceber.update({
      where: { id: String(id || "") },
      data: { receivedCents, status },
    });

    return { payment, updated };
  });

  return NextResponse.json({ ok: true, ...result });
}
