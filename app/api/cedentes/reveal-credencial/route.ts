import { NextRequest, NextResponse } from "next/server";
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

function canReveal(roleRaw: any) {
  const role = String(roleRaw || "").toUpperCase();
  return role === "ADMIN" || role === "OWNER";
}

const FIELD_MAP: Record<
  string,
  "senhaEmail" | "senhaLatamPass" | "senhaSmiles" | "senhaLivelo" | "senhaEsfera"
> = {
  EMAIL: "senhaEmail",
  LATAM: "senhaLatamPass",
  SMILES: "senhaSmiles",
  LIVELO: "senhaLivelo",
  ESFERA: "senhaEsfera",
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401, headers: noCacheHeaders() }
      );
    }
    if (!canReveal(session.role)) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão." },
        { status: 403, headers: noCacheHeaders() }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cedenteId = String(body?.cedenteId || "");
    const kind = String(body?.kind || "").toUpperCase();

    if (!cedenteId) {
      return NextResponse.json(
        { ok: false, error: "cedenteId é obrigatório." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const field = FIELD_MAP[kind];
    if (!field) {
      return NextResponse.json(
        { ok: false, error: "kind inválido. Use EMAIL|LATAM|SMILES|LIVELO|ESFERA." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const c = await prisma.cedente.findUnique({
      where: { id: cedenteId },
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        emailCriado: true,
        telefone: true,
        senhaEmail: true,
        senhaLatamPass: true,
        senhaSmiles: true,
        senhaLivelo: true,
        senhaEsfera: true,
      },
    });

    if (!c) {
      return NextResponse.json(
        { ok: false, error: "Cedente não encontrado." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    const value = (c as any)[field] as string | null;
    if (!value) {
      return NextResponse.json(
        { ok: false, error: "Senha não cadastrada para este item." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    // ✅ aqui seria o lugar ideal pra registrar auditoria (log em tabela)
    // por enquanto, fica sem (posso te passar o model de log e migração se quiser)

    return NextResponse.json(
      {
        ok: true,
        cedente: {
          id: c.id,
          nomeCompleto: c.nomeCompleto,
          cpf: c.cpf,
          emailCriado: c.emailCriado,
          telefone: c.telefone,
        },
        kind,
        value,
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao revelar credencial." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
