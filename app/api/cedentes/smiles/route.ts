import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function safeInt(v: unknown, fb = 0) {
  const s = String(v ?? "").replace(/\D+/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function scoreMedia(score?: {
  rapidezBiometria?: number;
  rapidezSms?: number;
  resolucaoProblema?: number;
  confianca?: number;
} | null) {
  const a = Number(score?.rapidezBiometria || 0);
  const b = Number(score?.rapidezSms || 0);
  const c = Number(score?.resolucaoProblema || 0);
  const d = Number(score?.confianca || 0);
  const avg = (a + b + c + d) / 4;
  return Math.round(avg * 100) / 100;
}

const SMILES_PASSENGERS_LIMIT_PER_YEAR = 25; // ajuste se sua regra mudar
const YEAR = 2026;

function yearBoundsUTC(year: number) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    // await requireSession();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const ownerId = (searchParams.get("ownerId") || "").trim();

    const where: any = { status: "APPROVED" };
    if (ownerId) where.ownerId = ownerId;

    if (q) {
      where.OR = [
        { nomeCompleto: { contains: q, mode: "insensitive" } },
        { identificador: { contains: q, mode: "insensitive" } },
        { cpf: { contains: q } },
      ];
    }

    const rows = await prisma.cedente.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        telefone: true,
        emailCriado: true,
        senhaEmail: true,
        senhaSmiles: true,
        pontosSmiles: true,
        score: {
          select: {
            rapidezBiometria: true,
            rapidezSms: true,
            resolucaoProblema: true,
            confianca: true,
          },
        },
        owner: { select: { id: true, name: true, login: true } },
      },
    });

    const cedenteIds = rows.map((r) => r.id);
    const usedByCedente = new Map<string, number>();

    if (cedenteIds.length) {
      const { start, end } = yearBoundsUTC(YEAR);

      const grouped = await prisma.emissionEvent.groupBy({
        by: ["cedenteId"],
        where: {
          cedenteId: { in: cedenteIds },
          program: "SMILES",
          issuedAt: { gte: start, lt: end },
        },
        _sum: { passengersCount: true },
      });

      for (const g of grouped) {
        usedByCedente.set(g.cedenteId, Number(g._sum.passengersCount || 0));
      }
    }

    const mapped = rows.map((r) => {
      const aprovado = r.pontosSmiles || 0;
      const pendente = 0; // TODO: plugar tua regra real
      const total = aprovado + pendente;

      const used2026 = usedByCedente.get(r.id) || 0;
      const limit2026 = SMILES_PASSENGERS_LIMIT_PER_YEAR;
      const remaining2026 = Math.max(0, limit2026 - used2026);

      return {
        id: r.id,
        identificador: r.identificador,
        nomeCompleto: r.nomeCompleto,
        cpf: r.cpf,
        telefone: r.telefone,
        emailCriado: r.emailCriado,
        senhaEmail: r.senhaEmail,
        senhaSmiles: r.senhaSmiles,
        owner: r.owner,
        scoreMedia: scoreMedia(r.score),

        smilesAprovado: aprovado,
        smilesPendente: pendente,
        smilesTotalEsperado: total,

        // ✅ NOVO: passageiros Smiles 2026
        smilesPassengersYear: YEAR,
        smilesPassengersLimit: limit2026,
        smilesPassengersUsed: used2026,
        smilesPassengersRemaining: remaining2026,
      };
    });

    return NextResponse.json(
      { ok: true, rows: mapped },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar SMILES." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // await requireSession();

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const pontosSmiles = safeInt(body?.pontosSmiles, NaN as any);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do cedente é obrigatório." },
        { status: 400, headers: noCacheHeaders() }
      );
    }
    if (!Number.isFinite(pontosSmiles) || pontosSmiles < 0) {
      return NextResponse.json(
        { ok: false, error: "pontosSmiles inválido." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    await prisma.cedente.update({
      where: { id },
      data: { pontosSmiles },
    });

    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar SMILES." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
