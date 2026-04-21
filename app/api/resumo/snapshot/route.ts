import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseCapturedAt(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return new Date();
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const body = await req.json();

    // ✅ Aceita 2 formatos:
    // (novo) cashCents, totalBruto, totalDividas, totalLiquido
    // (antigo) totalBrutoCents, totalDividasCents, totalLiquidoCents
    const cashCents = toInt(body.cashCents ?? body.caixaCents ?? 0);

    const totalBrutoCents = toInt(body.totalBruto ?? body.totalBrutoCents);
    const totalDividasCents = toInt(body.totalDividas ?? body.totalDividasCents);
    const totalLiquidoCents = toInt(body.totalLiquido ?? body.totalLiquidoCents);

    if (
      cashCents == null ||
      totalBrutoCents == null ||
      totalDividasCents == null ||
      totalLiquidoCents == null
    ) {
      return NextResponse.json(
        { ok: false, error: "Valores inválidos." },
        { status: 400 }
      );
    }

    const capturedAt = parseCapturedAt(body.capturedAt);

    await prisma.cashSnapshot.create({
      data: {
        team: session.team,
        date: capturedAt,
        cashCents,
        totalBruto: totalBrutoCents,
        totalDividas: totalDividasCents,
        totalLiquido: totalLiquidoCents,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar histórico." },
      { status: 500 }
    );
  }
}
