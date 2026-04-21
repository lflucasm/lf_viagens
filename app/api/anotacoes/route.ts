import { NextRequest, NextResponse } from "next/server";
import { AnotacaoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

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

function bad(error: string, status = 400) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: noCacheHeaders() }
  );
}

function normalizeStatus(raw: unknown): AnotacaoStatus | null {
  const v = String(raw || "")
    .trim()
    .toUpperCase();
  if (v === AnotacaoStatus.PENDENTE) return AnotacaoStatus.PENDENTE;
  if (v === AnotacaoStatus.RESOLVIDO) return AnotacaoStatus.RESOLVIDO;
  return null;
}

function normalizeTexto(raw: unknown): string {
  return String(raw || "").trim();
}

function sortByResolvedDate(a: { resolvedAt: Date | null; createdAt: Date }, b: { resolvedAt: Date | null; createdAt: Date }) {
  const aResolved = a.resolvedAt ? a.resolvedAt.getTime() : Number.NEGATIVE_INFINITY;
  const bResolved = b.resolvedAt ? b.resolvedAt.getTime() : Number.NEGATIVE_INFINITY;

  if (aResolved !== bResolved) return bResolved - aResolved;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function mapRow(row: {
  id: string;
  status: AnotacaoStatus;
  texto: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  cedente: { id: string; nomeCompleto: string; identificador: string; cpf: string };
  createdBy: { id: string; name: string; login: string };
}) {
  return {
    id: row.id,
    status: row.status,
    texto: row.texto,
    resolvedAt: row.resolvedAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cedente: row.cedente,
    createdBy: row.createdBy,
  };
}

async function ensureCedenteFromTeam(cedenteId: string, team: string) {
  const cedente = await prisma.cedente.findFirst({
    where: { id: cedenteId, owner: { team } },
    select: { id: true },
  });
  return cedente;
}

export async function GET() {
  try {
    const session = await requireSession();

    const rows = await prisma.anotacao.findMany({
      where: { team: session.team },
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            identificador: true,
            cpf: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
      },
      take: 5000,
    });

    rows.sort(sortByResolvedDate);

    return NextResponse.json(
      { ok: true, rows: rows.map(mapRow) },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao carregar anotações.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const cedenteId = String(body?.cedenteId || "").trim();
    const texto = normalizeTexto(body?.texto);
    const status = normalizeStatus(body?.status) || AnotacaoStatus.PENDENTE;

    if (!cedenteId) return bad("Conta (cedente) é obrigatória.");
    if (texto.length < 3) return bad("Anotação deve ter pelo menos 3 caracteres.");
    if (texto.length > 4000) return bad("Anotação muito longa (máximo 4000 caracteres).");

    const cedente = await ensureCedenteFromTeam(cedenteId, session.team);
    if (!cedente) return bad("Conta (cedente) não encontrada.", 404);

    const created = await prisma.anotacao.create({
      data: {
        team: session.team,
        cedenteId,
        texto,
        status,
        resolvedAt: status === AnotacaoStatus.RESOLVIDO ? new Date() : null,
        createdById: session.id,
      },
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            identificador: true,
            cpf: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
      },
    });

    return NextResponse.json(
      { ok: true, row: mapRow(created) },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao criar anotação.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const id = String(body?.id || "").trim();
    if (!id) return bad("id é obrigatório.");

    const current = await prisma.anotacao.findFirst({
      where: { id, team: session.team },
      select: {
        id: true,
        status: true,
        cedenteId: true,
      },
    });

    if (!current) return bad("Anotação não encontrada.", 404);

    const data: {
      texto?: string;
      status?: AnotacaoStatus;
      resolvedAt?: Date | null;
      cedenteId?: string;
    } = {};

    if (body?.texto != null) {
      const texto = normalizeTexto(body.texto);
      if (texto.length < 3) return bad("Anotação deve ter pelo menos 3 caracteres.");
      if (texto.length > 4000) return bad("Anotação muito longa (máximo 4000 caracteres).");
      data.texto = texto;
    }

    if (body?.cedenteId != null) {
      const cedenteId = String(body.cedenteId || "").trim();
      if (!cedenteId) return bad("Conta (cedente) é obrigatória.");
      const cedente = await ensureCedenteFromTeam(cedenteId, session.team);
      if (!cedente) return bad("Conta (cedente) não encontrada.", 404);
      data.cedenteId = cedenteId;
    }

    const nextStatus = body?.status != null ? normalizeStatus(body.status) : null;
    if (body?.status != null && !nextStatus) {
      return bad("Status inválido. Use PENDENTE ou RESOLVIDO.");
    }

    if (nextStatus) {
      data.status = nextStatus;
      if (nextStatus === AnotacaoStatus.RESOLVIDO) {
        data.resolvedAt = new Date();
      } else {
        data.resolvedAt = null;
      }
    }

    if (
      data.texto == null &&
      data.status == null &&
      data.cedenteId == null
    ) {
      return bad("Nenhuma alteração informada.");
    }

    const updated = await prisma.anotacao.update({
      where: { id: current.id },
      data,
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            identificador: true,
            cpf: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
      },
    });

    return NextResponse.json(
      { ok: true, row: mapRow(updated) },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao atualizar anotação.", 500);
  }
}
