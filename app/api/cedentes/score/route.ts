import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { CedenteStatus } from "@prisma/client";

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

function clampScore(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(10, n));
  return Math.round(clamped * 10) / 10;
}

function averageScore(args: {
  rapidezBiometria: number;
  rapidezSms: number;
  resolucaoProblema: number;
  confianca: number;
}) {
  const sum =
    args.rapidezBiometria +
    args.rapidezSms +
    args.resolucaoProblema +
    args.confianca;
  return Math.round((sum / 4) * 100) / 100;
}

function bad(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: noCacheHeaders() }
  );
}

export async function GET() {
  try {
    const session = await requireSession();

    const rows = await prisma.cedente.findMany({
      where: {
        owner: { team: session.team },
        status: { in: [CedenteStatus.PENDING, CedenteStatus.APPROVED] },
      },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        status: true,
        score: {
          select: {
            rapidezBiometria: true,
            rapidezSms: true,
            resolucaoProblema: true,
            confianca: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { nomeCompleto: "asc" },
      take: 5000,
    });

    const data = rows.map((r) => {
      const rapidezBiometria = Number(r.score?.rapidezBiometria || 0);
      const rapidezSms = Number(r.score?.rapidezSms || 0);
      const resolucaoProblema = Number(r.score?.resolucaoProblema || 0);
      const confianca = Number(r.score?.confianca || 0);

      return {
        id: r.id,
        identificador: r.identificador,
        nomeCompleto: r.nomeCompleto,
        status: r.status,
        rapidezBiometria,
        rapidezSms,
        resolucaoProblema,
        confianca,
        media: averageScore({
          rapidezBiometria,
          rapidezSms,
          resolucaoProblema,
          confianca,
        }),
        updatedAt: r.score?.updatedAt?.toISOString() || null,
      };
    });

    return NextResponse.json(
      { ok: true, rows: data },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao carregar scores dos cedentes.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const cedenteId = String(body?.cedenteId || "").trim();
    if (!cedenteId) return bad("cedenteId é obrigatório.");

    const rapidezBiometria = clampScore(body?.rapidezBiometria);
    const rapidezSms = clampScore(body?.rapidezSms);
    const resolucaoProblema = clampScore(body?.resolucaoProblema);
    const confianca = clampScore(body?.confianca);

    if (
      rapidezBiometria == null ||
      rapidezSms == null ||
      resolucaoProblema == null ||
      confianca == null
    ) {
      return bad("As notas devem ser números entre 0 e 10.");
    }

    const cedente = await prisma.cedente.findFirst({
      where: {
        id: cedenteId,
        owner: { team: session.team },
      },
      select: { id: true },
    });

    if (!cedente) return bad("Cedente não encontrado.", 404);

    const saved = await prisma.cedenteScore.upsert({
      where: { cedenteId },
      create: {
        cedenteId,
        rapidezBiometria,
        rapidezSms,
        resolucaoProblema,
        confianca,
      },
      update: {
        rapidezBiometria,
        rapidezSms,
        resolucaoProblema,
        confianca,
      },
      select: {
        cedenteId: true,
        rapidezBiometria: true,
        rapidezSms: true,
        resolucaoProblema: true,
        confianca: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        row: {
          cedenteId: saved.cedenteId,
          rapidezBiometria: Number(saved.rapidezBiometria || 0),
          rapidezSms: Number(saved.rapidezSms || 0),
          resolucaoProblema: Number(saved.resolucaoProblema || 0),
          confianca: Number(saved.confianca || 0),
          media: averageScore({
            rapidezBiometria: Number(saved.rapidezBiometria || 0),
            rapidezSms: Number(saved.rapidezSms || 0),
            resolucaoProblema: Number(saved.resolucaoProblema || 0),
            confianca: Number(saved.confianca || 0),
          }),
          updatedAt: saved.updatedAt.toISOString(),
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao salvar score do cedente.", 500);
  }
}
