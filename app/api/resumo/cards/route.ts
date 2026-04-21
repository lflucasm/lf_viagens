import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAmountCents(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export async function GET(req: Request) {
  try {
    const session = await requireSession(req);

    const rows = await prisma.creditCardBalance.findMany({
      where: { team: session.team },
      orderBy: [{ createdAt: "asc" }, { description: "asc" }],
      select: {
        id: true,
        description: true,
        amountCents: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: rows,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar cartões." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => ({}));

    const description = String(body?.description || "").trim();
    const amountCents = normalizeAmountCents(body?.amountCents);

    if (!description) {
      return NextResponse.json({ ok: false, error: "Informe a descrição do cartão." }, { status: 400 });
    }
    if (amountCents == null || amountCents < 0) {
      return NextResponse.json({ ok: false, error: "Informe um valor válido para o cartão." }, { status: 400 });
    }

    const row = await prisma.creditCardBalance.create({
      data: {
        team: session.team,
        description,
        amountCents,
      },
      select: {
        id: true,
        description: true,
        amountCents: true,
      },
    });

    return NextResponse.json({ ok: true, data: row });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar cartão." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession(req);
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") || "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID do cartão não informado." }, { status: 400 });
    }

    const result = await prisma.creditCardBalance.deleteMany({
      where: {
        id,
        team: session.team,
      },
    });

    if (!result.count) {
      return NextResponse.json({ ok: false, error: "Cartão não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao remover cartão." },
      { status: 500 }
    );
  }
}
