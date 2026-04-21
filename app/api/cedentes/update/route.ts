// app/api/cedentes/update/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set<string>([
  "identificador",
  "nomeCompleto",
  "cpf",
  "dataNascimento",
  "telefone",
  "emailCriado",

  "banco",
  "pixTipo",
  "chavePix",
  "titularConfirmado",

  "senhaEmail",
  "senhaSmiles",
  "senhaLatamPass",
  "senhaLivelo",
  "senhaEsfera",

  "pontosLatam",
  "pontosSmiles",
  "pontosLivelo",
  "pontosEsfera",

  "status",
  "reviewedAt",
  "reviewedById",
  "inviteId",
]);

function pickAllowed(data: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!ALLOWED_KEYS.has(k)) continue;

    // normaliza senhas vazias para null (ajuda a "limpar" campo)
    if (
      k.startsWith("senha") &&
      (v === "" || (typeof v === "string" && v.trim() === ""))
    ) {
      out[k] = null;
      continue;
    }

    out[k] = v;
  }
  return out;
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const id = body?.id;
    const data = body?.data;

    if (!id || !data) {
      return NextResponse.json(
        { ok: false, error: "ID ou data ausente." },
        { status: 400 }
      );
    }

    const safeData = pickAllowed(data);

    if (Object.keys(safeData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nenhum campo válido para atualizar." },
        { status: 400 }
      );
    }

    const updated = await prisma.cedente.update({
      where: { id },
      data: safeData,
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("PUT /api/cedentes/update error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar." },
      { status: 500 }
    );
  }
}
