import { NextResponse } from "next/server";
// ajuste o import do prisma conforme seu projeto
import { prisma } from "@/lib/prisma";

function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function GET() {
  try {
    const data = await prisma.receivable.findMany({
      orderBy: { createdAt: "desc" },
      include: { receipts: { orderBy: { receivedAt: "desc" } } },
    });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Erro" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim() || null;
    const totalStr = String(body?.total || "").trim();

    if (!title) return NextResponse.json({ ok: false, error: "Título obrigatório" }, { status: 400 });

    const totalCents = toCentsFromInput(totalStr);
    if (totalCents <= 0)
      return NextResponse.json({ ok: false, error: "Valor inválido" }, { status: 400 });

    const created = await prisma.receivable.create({
      data: {
        title,
        description,
        totalCents,
        receivedCents: 0,
        balanceCents: totalCents,
        status: "OPEN",
      },
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Erro" }, { status: 500 });
  }
}
