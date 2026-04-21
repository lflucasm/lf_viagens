import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { CedenteStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

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

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function canViewSecrets(roleRaw: any) {
  const role = String(roleRaw || "").toUpperCase();
  return role === "ADMIN" || role === "OWNER";
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    if (!canViewSecrets(session.role)) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão." },
        { status: 403, headers: noCacheHeaders() }
      );
    }

    const url = new URL(req.url);
    const days = clampInt(url.searchParams.get("days"), 1, 90, 7);

    // ✅ basis tipado (evita string solta)
    const basisParam = url.searchParams.get("basis");
    const basis: "reviewedAt" | "createdAt" =
      basisParam === "createdAt" ? "createdAt" : "reviewedAt";

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ✅ where tipado + enum correto (resolve o erro do build)
    const baseWhere = {
      status: CedenteStatus.APPROVED,
      // ✅ recomendado: isola por time (se sua app é multi-time)
      owner: { team: session.team },
    } satisfies Prisma.CedenteWhereInput;

    const where: Prisma.CedenteWhereInput =
      basis === "createdAt"
        ? { ...baseWhere, createdAt: { gte: since } }
        : { ...baseWhere, reviewedAt: { gte: since } };

    // ✅ orderBy consistente com o basis
    const orderBy: Prisma.CedenteOrderByWithRelationInput[] =
      basis === "createdAt"
        ? [{ createdAt: "desc" }]
        : [{ reviewedAt: "desc" }, { createdAt: "desc" }];

    const rows = await prisma.cedente.findMany({
      where,
      orderBy,
      take: 500,
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,

        telefone: true,
        emailCriado: true,

        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,

        status: true,
        createdAt: true,
        reviewedAt: true,

        reviewedBy: { select: { id: true, name: true, login: true } },
        owner: { select: { id: true, name: true, login: true } },

        // ⚠️ NÃO devolve as senhas pro client: só usamos pra flags
        senhaEmail: true,
        senhaLatamPass: true,
        senhaSmiles: true,
        senhaLivelo: true,
        senhaEsfera: true,

        blockedAccounts: {
          where: { status: "OPEN" },
          select: { program: true },
        },
      },
    });

    const data = rows.map((r) => ({
      id: r.id,
      identificador: r.identificador,
      nomeCompleto: r.nomeCompleto,
      cpf: r.cpf,

      telefone: r.telefone,
      emailCriado: r.emailCriado,

      pontosLatam: r.pontosLatam,
      pontosSmiles: r.pontosSmiles,
      pontosLivelo: r.pontosLivelo,
      pontosEsfera: r.pontosEsfera,

      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,

      owner: r.owner,
      reviewedBy: r.reviewedBy,

      blockedPrograms: (r.blockedAccounts || []).map((b) => b.program),

      // ✅ flags (pra UI mostrar os botões)
      hasSenhaEmail: !!r.senhaEmail,
      hasSenhaLatamPass: !!r.senhaLatamPass,
      hasSenhaSmiles: !!r.senhaSmiles,
      hasSenhaLivelo: !!r.senhaLivelo,
      hasSenhaEsfera: !!r.senhaEsfera,
    }));

    return NextResponse.json(
      { ok: true, days, basis, since: since.toISOString(), data },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar cedentes aprovados." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
