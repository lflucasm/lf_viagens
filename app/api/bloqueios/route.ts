import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function programPoints(ced: any, program: string) {
  if (!ced) return 0;
  if (program === "LATAM") return ced.pontosLatam || 0;
  if (program === "SMILES") return ced.pontosSmiles || 0;
  if (program === "LIVELO") return ced.pontosLivelo || 0;
  if (program === "ESFERA") return ced.pontosEsfera || 0;
  return 0;
}

function calcValueCents(points: number, rateCents: number) {
  const milheiros = Math.floor((points || 0) / 1000);
  return milheiros * (rateCents || 0);
}

export async function GET() {
  try {
    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: {
        latamRateCents: true,
        smilesRateCents: true,
        liveloRateCents: true,
        esferaRateCents: true,
      },
    });

    const blocks = await prisma.blockedAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosLatam: true,
            pontosSmiles: true,
            pontosLivelo: true,
            pontosEsfera: true,
          },
        },
        observations: { orderBy: { createdAt: "desc" } },
      },
    });

    const rows = blocks.map((b) => {
      const pts = programPoints(b.cedente, b.program);
      const rateCents =
        b.program === "LATAM"
          ? settings.latamRateCents
          : b.program === "SMILES"
          ? settings.smilesRateCents
          : b.program === "LIVELO"
          ? settings.liveloRateCents
          : settings.esferaRateCents;

      const valueCents = calcValueCents(pts, rateCents);

      return {
        id: b.id,
        status: b.status,
        program: b.program,
        note: b.note,
        estimatedUnlockAt: b.estimatedUnlockAt ? b.estimatedUnlockAt.toISOString() : null,
        resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null,
        createdAt: b.createdAt.toISOString(),
        cedente: {
          id: b.cedente.id,
          identificador: b.cedente.identificador,
          nomeCompleto: b.cedente.nomeCompleto,
          cpf: b.cedente.cpf,
        },
        pointsBlocked: pts,
        valueBlockedCents: valueCents,
        observations: b.observations.map((o) => ({
          id: o.id,
          text: o.text,
          createdAt: o.createdAt.toISOString(),
        })),
      };
    });

    const open = rows.filter((r) => r.status === "OPEN");
    const totals = {
      openCount: open.length,
      pointsBlocked: open.reduce((a, r) => a + (r.pointsBlocked || 0), 0),
      valueBlockedCents: open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0),
    };

    return NextResponse.json(
      {
        ok: true,
        data: {
          rows,
          totals,
          ratesCents: settings, // pra front mostrar/explicar se quiser
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cedenteId = String(body?.cedenteId || "").trim();
    const program = String(body?.program || "").trim();
    const note = String(body?.note || "").trim() || null;

    const estimatedUnlock = String(body?.estimatedUnlockAt || "").trim();
    const estimatedUnlockAt = estimatedUnlock ? new Date(estimatedUnlock) : null;

    if (!cedenteId) return NextResponse.json({ ok: false, error: "Selecione a conta (cedente)." }, { status: 400 });
    if (!["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(program))
      return NextResponse.json({ ok: false, error: "Programa inválido." }, { status: 400 });

    // (opcional) createdById: se você tiver sessão, aqui você pega e seta.
    const createdById = null;

    const created = await prisma.blockedAccount.create({
      data: {
        cedenteId,
        program: program as any,
        note,
        estimatedUnlockAt,
        createdById,
        status: "OPEN",
      },
    });

    return NextResponse.json({ ok: true, data: { id: created.id } }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro." }, { status: 500 });
  }
}
