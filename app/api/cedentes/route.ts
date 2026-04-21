// app/api/cedentes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { releaseExcludedCpfIfNeeded } from "@/lib/cedentes/releaseExcludedCpf";
import { PixTipo, CedenteStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits11(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

const PIX_TIPOS = new Set<keyof typeof PixTipo>([
  "CPF",
  "CNPJ",
  "EMAIL",
  "TELEFONE",
  "ALEATORIA",
]);

function asTrimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function asIntNonNeg(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function parseDateOrNull(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const nomeCompleto =
      typeof body?.nomeCompleto === "string" ? body.nomeCompleto.trim() : "";

    const cpf = onlyDigits11(typeof body?.cpf === "string" ? body.cpf : "");

    if (!nomeCompleto) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome completo." },
        { status: 400 }
      );
    }

    if (cpf.length !== 11) {
      return NextResponse.json(
        { ok: false, error: "CPF inválido (11 dígitos)." },
        { status: 400 }
      );
    }

    // 🔐 owner obrigatório (tenta usar sessão se não vier no body)
    let ownerId = typeof body?.ownerId === "string" ? body.ownerId.trim() : "";

    if (!ownerId) {
      const session = await getSession();
      if (session?.id) ownerId = session.id;
    }

    if (!ownerId) {
      return NextResponse.json(
        { ok: false, error: "ownerId é obrigatório para criar cedente." },
        { status: 400 }
      );
    }

    // 📅 dataNascimento
    const dataNascimento = parseDateOrNull(body?.dataNascimento);

    // 📌 status (default PENDING)
    const statusRaw =
      typeof body?.status === "string" ? body.status.trim().toUpperCase() : "";

    const status: CedenteStatus =
      statusRaw === "APPROVED" || statusRaw === "REJECTED" || statusRaw === "PENDING"
        ? (statusRaw as CedenteStatus)
        : CedenteStatus.PENDING;

    // 💰 pixTipo — obrigatório
    const pixTipoRaw =
      typeof body?.pixTipo === "string" ? body.pixTipo.trim().toUpperCase() : "";

    if (!PIX_TIPOS.has(pixTipoRaw as keyof typeof PixTipo)) {
      return NextResponse.json(
        {
          ok: false,
          error: "pixTipo inválido. Use: CPF, CNPJ, EMAIL, TELEFONE ou ALEATORIA.",
        },
        { status: 400 }
      );
    }

    const pixTipo = PixTipo[pixTipoRaw as keyof typeof PixTipo];

    // 🧾 banco + chavePix obrigatórios
    const banco = typeof body?.banco === "string" ? body.banco.trim() : "";
    const chavePix = typeof body?.chavePix === "string" ? body.chavePix.trim() : "";

    if (!banco || !chavePix) {
      return NextResponse.json(
        {
          ok: false,
          error: "Banco e chave PIX são obrigatórios (pagamento somente ao titular).",
        },
        { status: 400 }
      );
    }

    const identificador =
      (typeof body?.identificador === "string" ? body.identificador.trim() : "") ||
      `CED-${Date.now().toString().slice(-6)}`;

    const cedente = await prisma.$transaction(async (tx) => {
      await releaseExcludedCpfIfNeeded(tx, cpf);

      return tx.cedente.create({
        data: {
          identificador,
          nomeCompleto,
          cpf,
          dataNascimento,

          telefone: asTrimOrNull(body?.telefone),
          emailCriado: asTrimOrNull(body?.emailCriado),

          banco,
          chavePix,
          pixTipo,
          titularConfirmado: true,

          // ✅ SENHAS (SEM ENC)
          senhaEmail: asTrimOrNull(body?.senhaEmail),
          senhaSmiles: asTrimOrNull(body?.senhaSmiles),
          senhaLatamPass: asTrimOrNull(body?.senhaLatamPass),
          senhaLivelo: asTrimOrNull(body?.senhaLivelo),
          senhaEsfera: asTrimOrNull(body?.senhaEsfera),

          pontosLatam: asIntNonNeg(body?.pontosLatam),
          pontosSmiles: asIntNonNeg(body?.pontosSmiles),
          pontosLivelo: asIntNonNeg(body?.pontosLivelo),
          pontosEsfera: asIntNonNeg(body?.pontosEsfera),

          status,

          owner: {
            connect: { id: ownerId },
          },
        },
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          cpf: true,
          status: true,
          createdAt: true,
          ownerId: true,
        },
      });
    });

    return NextResponse.json({ ok: true, data: cedente }, { status: 201 });
  } catch (e: any) {
    console.error(e);

    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Já existe um cedente com esse CPF ou identificador." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar cedente." },
      { status: 500 }
    );
  }
}
