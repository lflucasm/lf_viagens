// app/api/cedentes/termos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { TERMO_WHATSAPP } from "@/lib/termos";
import { CedenteStatus, TermTriState, TermResponseTime } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const TRI = new Set<string>(["YES", "NO", "NO_RESPONSE"]);
const RT = new Set<string>(["H1", "H2", "H3", "GT3"]);

function toTri(v: unknown): TermTriState | null {
  const s = asString(v).trim().toUpperCase();
  return TRI.has(s) ? (s as TermTriState) : null;
}

function toRT(v: unknown): TermResponseTime | null {
  const s = asString(v).trim().toUpperCase();
  return RT.has(s) ? (s as TermResponseTime) : null;
}

function responseTimePoints(rt: TermResponseTime | null) {
  switch (rt) {
    case "H1":
      return 30;
    case "H2":
      return 20;
    case "H3":
      return 10;
    case "GT3":
      return 0;
    default:
      return 0;
  }
}

function phoneToWaNumber(raw: string | null | undefined) {
  const d = String(raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 11) return `55${d}`;
  if (d.length === 10) return `55${d}`;
  return d;
}

function buildWaLink(waNumber: string, text?: string) {
  const base = `https://wa.me/${waNumber}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

function computeScore(review: {
  responseTime?: TermResponseTime | null;
  disponibilidadePoints?: number | null;
}) {
  const rtPts = responseTimePoints(review?.responseTime ?? null);
  const disp = clampInt(review?.disponibilidadePoints ?? 0, 0, 70);
  const score = rtPts + disp; // 0..100
  return { rtPts, disp, score };
}

function computeColor(review: {
  aceiteOutros?: TermTriState | null;
  aceiteLatam?: TermTriState | null;
  exclusaoDef?: TermTriState | null;
}) {
  if (review?.exclusaoDef === "YES") return "RED";
  if (review?.aceiteOutros === "YES" && review?.aceiteLatam === "YES") return "GREEN";
  if (review?.aceiteOutros === "NO_RESPONSE" || review?.aceiteLatam === "NO_RESPONSE") return "GRAY";
  return "YELLOW";
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const termoVersao = (searchParams.get("versao") || "v1").trim();

    // ✅ MESMA BASE DO "approved": todos os cedentes aprovados
    const cedentes = await prisma.cedente.findMany({
      where: { status: CedenteStatus.APPROVED },
      orderBy: { nomeCompleto: "asc" },
      select: {
        // base “approved”
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        createdAt: true,

        // termos / whatsapp
        telefone: true,

        owner: { select: { id: true, name: true, login: true } },

        termReviews: {
          where: { termoVersao },
          take: 1,
          select: {
            aceiteOutros: true,
            aceiteLatam: true,
            exclusaoDef: true,
            responseTime: true,
            disponibilidadePoints: true,
            updatedAt: true,
            termoVersao: true,
            cedenteId: true,
          },
        },
      },
    });

    const data = cedentes.map((c) => {
      const review = c.termReviews[0] || null;

      const waNumber = phoneToWaNumber(c.telefone);
      const waUrl = waNumber ? buildWaLink(waNumber) : null;
      const waUrlTermo = waNumber ? buildWaLink(waNumber, TERMO_WHATSAPP) : null;

      const scorePack = review ? computeScore(review) : { rtPts: 0, disp: 0, score: 0 };
      const color = review ? computeColor(review) : "GRAY";

      return {
        id: c.id,
        identificador: c.identificador,
        nomeCompleto: c.nomeCompleto,
        cpf: c.cpf,
        createdAt: c.createdAt,
        owner: c.owner,
        telefone: c.telefone,

        whatsapp: {
          waNumber,
          waUrl,
          waUrlTermo,
          termoTexto: TERMO_WHATSAPP,
        },

        review,
        score: {
          responseTimePoints: scorePack.rtPts,
          disponibilidadePoints: scorePack.disp,
          total: scorePack.score,
          color,
        },
      };
    });

    return NextResponse.json(
      { ok: true, termoVersao, termoTexto: TERMO_WHATSAPP, data },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("GET /api/cedentes/termos ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const cedenteId = asString(body?.cedenteId).trim();
    const termoVersao = (asString(body?.termoVersao).trim() || "v1").trim();

    if (!cedenteId) {
      return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
    }

    const aceiteOutros = toTri(body?.aceiteOutros);
    const aceiteLatam = toTri(body?.aceiteLatam);
    const exclusaoDef = toTri(body?.exclusaoDef);
    const responseTime = toRT(body?.responseTime);
    const disponibilidadePoints = clampInt(body?.disponibilidadePoints, 0, 70);

    const review = await prisma.cedenteTermReview.upsert({
      where: {
        // ✅ seu unique correto
        cedenteId_termoVersao: { cedenteId, termoVersao },
      },
      create: {
        cedenteId,
        termoVersao,
        aceiteOutros,
        aceiteLatam,
        exclusaoDef,
        responseTime,
        disponibilidadePoints,
      },
      update: {
        aceiteOutros,
        aceiteLatam,
        exclusaoDef,
        responseTime,
        disponibilidadePoints,
      },
      select: {
        aceiteOutros: true,
        aceiteLatam: true,
        exclusaoDef: true,
        responseTime: true,
        disponibilidadePoints: true,
        updatedAt: true,
        termoVersao: true,
        cedenteId: true,
      },
    });

    const scorePack = computeScore(review);
    const color = computeColor(review);

    return NextResponse.json(
      {
        ok: true,
        data: {
          review,
          score: {
            responseTimePoints: scorePack.rtPts,
            disponibilidadePoints: scorePack.disp,
            total: scorePack.score,
            color,
          },
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("POST /api/cedentes/termos ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
