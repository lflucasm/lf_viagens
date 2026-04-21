import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PixTipo } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: any };

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

async function resolveParams(params: any) {
  return typeof params?.then === "function" ? await params : params;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

function strOrNull(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function intNonNeg(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function parseDateOrNull(v: any): Date | null | undefined {
  // undefined = não mexe
  // null = limpa
  if (v === undefined) return undefined;
  if (v === null) return null;

  const s = String(v).trim();
  if (!s) return null;

  // aceita YYYY-MM-DD ou ISO
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

const SELECT = {
  id: true,
  identificador: true,

  nomeCompleto: true,
  dataNascimento: true,
  cpf: true,

  telefone: true,
  emailCriado: true,

  banco: true,
  pixTipo: true,
  chavePix: true,
  titularConfirmado: true,

  senhaEmail: true,
  senhaSmiles: true,
  senhaLatamPass: true,
  senhaLivelo: true,
  senhaEsfera: true,

  pontosLatam: true,
  pontosSmiles: true,
  pontosLivelo: true,
  pontosEsfera: true,

  status: true,
  reviewedAt: true,

  ownerId: true,
  owner: { select: { id: true, name: true, login: true } },

  reviewedById: true,
  inviteId: true,

  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await resolveParams(ctx.params);
    if (!id) return bad("ID ausente.", 400);

    const cedente = await prisma.cedente.findUnique({
      where: { id },
      select: SELECT,
    });

    if (!cedente) return bad("Cedente não encontrado.", 404);

    return NextResponse.json({ ok: true, data: cedente }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return bad(e?.message || "Erro ao buscar cedente.", 500);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await resolveParams(ctx.params);
    if (!id) return bad("ID ausente.", 400);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("Body inválido.", 400);

    // garante que existe
    const current = await prisma.cedente.findUnique({
      where: { id },
      select: {
        id: true,
        cpf: true,
        identificador: true,
        nomeCompleto: true,
        banco: true,
        pixTipo: true,
        chavePix: true,
      },
    });
    if (!current) return bad("Cedente não encontrado.", 404);

    // trava CPF
    if ("cpf" in body && body.cpf && String(body.cpf).trim() !== String(current.cpf).trim()) {
      return bad("CPF não pode ser editado.", 400);
    }

    const data: any = {};

    // strings
    if ("identificador" in body) data.identificador = strOrNull(body.identificador);
    if ("nomeCompleto" in body) data.nomeCompleto = strOrNull(body.nomeCompleto);

    if ("telefone" in body) data.telefone = strOrNull(body.telefone);
    if ("emailCriado" in body) data.emailCriado = strOrNull(body.emailCriado);

    if ("banco" in body) data.banco = strOrNull(body.banco);
    if ("chavePix" in body) data.chavePix = strOrNull(body.chavePix);

    if ("pixTipo" in body) {
      const raw = strOrNull(body.pixTipo);
      if (!raw) return bad("Pix tipo é obrigatório.", 400);

      const upper = raw.toUpperCase();
      if (!(upper in PixTipo)) {
        return bad("pixTipo inválido. Use: CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA.", 400);
      }
      data.pixTipo = PixTipo[upper as keyof typeof PixTipo];
    }

    // date
    if ("dataNascimento" in body) {
      const parsed = parseDateOrNull(body.dataNascimento);
      if (parsed === undefined) return bad("dataNascimento inválida.", 400);
      data.dataNascimento = parsed;
    }

    // senhas
    if ("senhaEmail" in body) data.senhaEmail = strOrNull(body.senhaEmail);
    if ("senhaSmiles" in body) data.senhaSmiles = strOrNull(body.senhaSmiles);
    if ("senhaLatamPass" in body) data.senhaLatamPass = strOrNull(body.senhaLatamPass);
    if ("senhaLivelo" in body) data.senhaLivelo = strOrNull(body.senhaLivelo);
    if ("senhaEsfera" in body) data.senhaEsfera = strOrNull(body.senhaEsfera);

    // pontos
    if ("pontosLatam" in body) data.pontosLatam = intNonNeg(body.pontosLatam);
    if ("pontosSmiles" in body) data.pontosSmiles = intNonNeg(body.pontosSmiles);
    if ("pontosLivelo" in body) data.pontosLivelo = intNonNeg(body.pontosLivelo);
    if ("pontosEsfera" in body) data.pontosEsfera = intNonNeg(body.pontosEsfera);

    // obrigatórios (mantém current se não veio no body)
    const bancoFinal = "banco" in data ? data.banco : current.banco;
    const chavePixFinal = "chavePix" in data ? data.chavePix : current.chavePix;
    const pixTipoFinal = "pixTipo" in data ? data.pixTipo : current.pixTipo;

    if (!bancoFinal) return bad("Banco é obrigatório.", 400);
    if (!chavePixFinal) return bad("Chave Pix é obrigatória.", 400);
    if (!pixTipoFinal) return bad("Pix tipo é obrigatório.", 400);

    const identificadorFinal = "identificador" in data ? data.identificador : current.identificador;
    const nomeFinal = "nomeCompleto" in data ? data.nomeCompleto : current.nomeCompleto;

    if (!identificadorFinal) return bad("Identificador não pode ficar vazio.", 400);
    if (!nomeFinal) return bad("Nome completo não pode ficar vazio.", 400);

    data.banco = bancoFinal;
    data.chavePix = chavePixFinal;
    data.pixTipo = pixTipoFinal;
    data.identificador = identificadorFinal;
    data.nomeCompleto = nomeFinal;

    const updated = await prisma.cedente.update({
      where: { id },
      data,
      select: SELECT,
    });

    return NextResponse.json({ ok: true, data: updated }, { headers: noCacheHeaders() });
  } catch (e: any) {
    if (e?.code === "P2025") return bad("Cedente não encontrado.", 404);

    if (e?.code === "P2002") {
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(", ") : String(e?.meta?.target || "");
      return bad(`Conflito de duplicidade (campo único). ${target ? `Campo: ${target}` : ""}`.trim(), 409);
    }

    return bad(e?.message || "Erro ao salvar cedente.", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return PUT(req, ctx);
}
