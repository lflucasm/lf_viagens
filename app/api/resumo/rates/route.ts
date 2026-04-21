// app/api/resumo/rates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCents(v: any) {
  // "20" -> 2000, "20,5" -> 2050, "20.5" -> 2050
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const latamRateCents = toCents(body?.latam);
    const smilesRateCents = toCents(body?.smiles);
    const liveloRateCents = toCents(body?.livelo);
    const esferaRateCents = toCents(body?.esfera);

    // validação simples (evita salvar 0 sem querer)
    if (
      latamRateCents <= 0 ||
      smilesRateCents <= 0 ||
      liveloRateCents <= 0 ||
      esferaRateCents <= 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Informe valores válidos (> 0) para todos os milheiros." },
        { status: 400 }
      );
    }

    const saved = await prisma.settings.upsert({
      where: { key: "default" },
      create: {
        key: "default",
        latamRateCents,
        smilesRateCents,
        liveloRateCents,
        esferaRateCents,
      },
      update: {
        latamRateCents,
        smilesRateCents,
        liveloRateCents,
        esferaRateCents,
      },
      select: {
        latamRateCents: true,
        smilesRateCents: true,
        liveloRateCents: true,
        esferaRateCents: true,
      },
    });

    return NextResponse.json({ ok: true, data: saved }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar rates." },
      { status: 500 }
    );
  }
}
