// app/api/dividas/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function strOrNull(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseDateOrNull(v: any): Date | null | undefined {
  // undefined = não mexe; null/"" = limpa
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // aceita YYYY-MM-DD ou ISO
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000` : s);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

function parseOrderOrNull(v: any): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID da dívida ausente." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const debt = await prisma.debt.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!debt) {
      return NextResponse.json({ ok: false, error: "Dívida não encontrada." }, { status: 404 });
    }

    if (debt.status !== "OPEN") {
      return NextResponse.json(
        { ok: false, error: "Dívida quitada/cancelada não pode ser alterada." },
        { status: 400 }
      );
    }

    const data: any = {};

    if ("creditorName" in body) data.creditorName = strOrNull(body.creditorName);
    if ("description" in body) data.description = strOrNull(body.description);

    if ("dueDate" in body) {
      const parsed = parseDateOrNull(body.dueDate);
      if (parsed === undefined) {
        return NextResponse.json({ ok: false, error: "Data de vencimento inválida." }, { status: 400 });
      }
      data.dueDate = parsed;
    }

    if ("payOrder" in body) {
      const parsed = parseOrderOrNull(body.payOrder);
      data.payOrder = parsed ?? null;
    }

    const updated = await prisma.debt.update({
      where: { id },
      data,
      select: { id: true },
    });

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao atualizar dívida." },
      { status: 500 }
    );
  }
}

