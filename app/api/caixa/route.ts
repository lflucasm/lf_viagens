// app/api/caixa/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parseCapturedAt(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return new Date();
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => ({}));

    // Agora o endpoint grava o HISTÓRICO DO TOTAL (principalmente o líquido).
    // Espera centavos (Int) vindo do front:
    // { totalBruto: number, totalDividas: number, totalLiquido: number }
    const totalBruto = toInt(body?.totalBruto);
    const totalDividas = toInt(body?.totalDividas);
    const totalLiquido = toInt(body?.totalLiquido);

    const date = parseCapturedAt(body?.capturedAt);

    const created = await prisma.cashSnapshot.create({
      data: { team: session.team, date, totalBruto, totalDividas, totalLiquido },
      select: { id: true, date: true, totalBruto: true, totalDividas: true, totalLiquido: true },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: created.id,
          date: created.date.toISOString(),
          totalBruto: created.totalBruto,
          totalDividas: created.totalDividas,
          totalLiquido: created.totalLiquido,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar histórico." },
      { status: 500 }
    );
  }
}
