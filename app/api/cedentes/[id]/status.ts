import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PixTipo, CedenteStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: { id: string } };

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D+/g, "");
}

function normalizeCpfSafe(v: unknown): string {
  let cpf = onlyDigits(v);
  if (cpf.length === 10) cpf = "0" + cpf;
  return cpf;
}

function parseDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizePixTipo(v: unknown): PixTipo {
  const s = String(v ?? "").trim().toUpperCase();
  if (s in PixTipo) return PixTipo[s as keyof typeof PixTipo];
  return PixTipo.CPF;
}

// "" -> null (para campos nullable)
function asTrimOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function numSafe(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =======================
   GET – buscar cedente
======================= */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });
    }

    const cedente = await prisma.cedente.findUnique({
      where: { id },
      select: {
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

        // ✅ SENHAS (SEM ENC)
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
      },
    });

    if (!cedente) {
      return NextResponse.json(
        { ok: false, error: "Cedente não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: cedente });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar cedente." },
      { status: 500 }
    );
  }
}

/* =======================
   PUT – atualizar cedente
======================= */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = params;
    const body = await req.json().catch(() => null);

    if (!id || !body) {
      return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
    }

    const exists = await prisma.cedente.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { ok: false, error: "Cedente não encontrado." },
        { status: 404 }
      );
    }

    // ✅ ownerId 100% obrigatório (SEM null)
    const ownerId = String(body?.ownerId ?? "").trim();
    if (!ownerId) {
      return NextResponse.json(
        { ok: false, error: "ownerId é obrigatório." },
        { status: 400 }
      );
    }

    const cpfBody = body?.cpf ? normalizeCpfSafe(body.cpf) : undefined;

    const updated = await prisma.cedente.update({
      where: { id },
      data: {
        identificador: body?.identificador ? String(body.identificador).trim() : undefined,
        nomeCompleto: body?.nomeCompleto ? String(body.nomeCompleto).trim() : undefined,

        // se não quiser permitir atualizar cpf, pode remover esse campo
        cpf: cpfBody && cpfBody.length === 11 ? cpfBody : undefined,

        dataNascimento:
          body?.dataNascimento !== undefined ? parseDateSafe(body.dataNascimento) : undefined,

        // "" limpa -> null (nullable)
        telefone:
          body?.telefone === ""
            ? null
            : body?.telefone !== undefined
            ? String(body.telefone).trim()
            : undefined,

        emailCriado:
          body?.emailCriado === ""
            ? null
            : body?.emailCriado !== undefined
            ? String(body.emailCriado).trim()
            : undefined,

        // se banco/chavePix forem String (não-null) no schema: não mande null
        banco:
          body?.banco === ""
            ? undefined
            : body?.banco !== undefined
            ? String(body.banco).trim()
            : undefined,

        pixTipo: body?.pixTipo !== undefined ? normalizePixTipo(body.pixTipo) : undefined,

        chavePix:
          body?.chavePix === ""
            ? undefined
            : body?.chavePix !== undefined
            ? String(body.chavePix).trim()
            : undefined,

        titularConfirmado:
          typeof body?.titularConfirmado === "boolean" ? body.titularConfirmado : undefined,

        // ✅ SENHAS (SEM ENC) — "" limpa -> null (nullable)
        senhaEmail: body?.senhaEmail !== undefined ? asTrimOrNull(body.senhaEmail) : undefined,
        senhaSmiles: body?.senhaSmiles !== undefined ? asTrimOrNull(body.senhaSmiles) : undefined,
        senhaLatamPass:
          body?.senhaLatamPass !== undefined ? asTrimOrNull(body.senhaLatamPass) : undefined,
        senhaLivelo: body?.senhaLivelo !== undefined ? asTrimOrNull(body.senhaLivelo) : undefined,
        senhaEsfera: body?.senhaEsfera !== undefined ? asTrimOrNull(body.senhaEsfera) : undefined,

        pontosLatam:
          body?.pontosLatam !== undefined
            ? Math.max(0, Math.floor(numSafe(body.pontosLatam)))
            : undefined,
        pontosSmiles:
          body?.pontosSmiles !== undefined
            ? Math.max(0, Math.floor(numSafe(body.pontosSmiles)))
            : undefined,
        pontosLivelo:
          body?.pontosLivelo !== undefined
            ? Math.max(0, Math.floor(numSafe(body.pontosLivelo)))
            : undefined,
        pontosEsfera:
          body?.pontosEsfera !== undefined
            ? Math.max(0, Math.floor(numSafe(body.pontosEsfera)))
            : undefined,

        status: body?.status ? (String(body.status) as CedenteStatus) : undefined,

        // ✅ sempre string (obrigatório)
        ownerId,
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("[CEDENTE PUT]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao atualizar cedente." },
      { status: 500 }
    );
  }
}

/* =======================
   DELETE – excluir cedente
======================= */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });
    }

    await prisma.cedente.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[CEDENTE DELETE]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao excluir cedente." },
      { status: 500 }
    );
  }
}
