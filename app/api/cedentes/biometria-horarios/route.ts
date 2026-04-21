import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { TERMO_VERSAO } from "@/lib/termos";

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

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data }, { headers: noCacheHeaders() });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

function asBool(v: unknown) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function isTruthy(v: string | null) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session?.id) return bad("Não autenticado.", 401);

  try {
    const url = new URL(req.url);
    const termoVersao = (url.searchParams.get("versao") || TERMO_VERSAO).trim();
    const includeAll = isTruthy(url.searchParams.get("all"));

    const cedentes = await prisma.cedente.findMany({
      where: {
        status: "APPROVED",
        owner: { team: session.team },
        ...(includeAll
          ? {}
          : {
              termReviews: {
                some: {
                  termoVersao,
                  aceiteLatam: "YES",
                },
              },
            }),
      },
      orderBy: { nomeCompleto: "asc" },
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        owner: { select: { id: true, name: true, login: true } },
        biometriaHorario: {
          select: {
            turnoManha: true,
            turnoTarde: true,
            turnoNoite: true,
            updatedAt: true,
          },
        },
      },
    });

    const items = cedentes.map((c) => ({
      id: c.id,
      nomeCompleto: c.nomeCompleto,
      cpf: c.cpf,
      owner: c.owner,
      horarios: c.biometriaHorario
        ? {
            turnoManha: c.biometriaHorario.turnoManha,
            turnoTarde: c.biometriaHorario.turnoTarde,
            turnoNoite: c.biometriaHorario.turnoNoite,
            updatedAt: c.biometriaHorario.updatedAt?.toISOString() ?? null,
          }
        : {
            turnoManha: false,
            turnoTarde: false,
            turnoNoite: false,
            updatedAt: null,
          },
    }));

    return ok({ termoVersao, items });
  } catch (error: unknown) {
    console.error("GET /api/cedentes/biometria-horarios ERROR:", error);
    return bad(getErrorMessage(error, "Erro interno."), 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionServer();
  if (!session?.id) return bad("Não autenticado.", 401);

  try {
    const body = await req.json().catch(() => ({}));
    const cedenteId = String(body?.cedenteId || "").trim();

    if (!cedenteId) return bad("cedenteId é obrigatório.");

    const cedente = await prisma.cedente.findFirst({
      where: { id: cedenteId, owner: { team: session.team } },
      select: { id: true },
    });

    if (!cedente) return bad("Sem permissão.", 403);

    const turnoManha = asBool(body?.turnoManha);
    const turnoTarde = asBool(body?.turnoTarde);
    const turnoNoite = asBool(body?.turnoNoite);

    const row = await prisma.cedenteBiometriaHorario.upsert({
      where: { cedenteId },
      create: {
        cedenteId,
        turnoManha,
        turnoTarde,
        turnoNoite,
      },
      update: {
        turnoManha,
        turnoTarde,
        turnoNoite,
      },
      select: {
        turnoManha: true,
        turnoTarde: true,
        turnoNoite: true,
        updatedAt: true,
      },
    });

    return ok({
      cedenteId,
      horarios: {
        turnoManha: row.turnoManha,
        turnoTarde: row.turnoTarde,
        turnoNoite: row.turnoNoite,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/cedentes/biometria-horarios ERROR:", error);
    return bad(getErrorMessage(error, "Erro interno."), 500);
  }
}
