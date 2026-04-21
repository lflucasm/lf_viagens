import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseStatus(input: unknown) {
  const value = String(input || "").trim().toUpperCase();
  if (value === "PENDING" || value === "APPROVED" || value === "REJECTED") {
    return value;
  }
  return null;
}

function normalizeNotes(input: unknown) {
  if (input === undefined) return undefined;
  const value = String(input ?? "").trim();
  return value ? value.slice(0, 2000) : null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do cadastro ausente." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const status = parseStatus(body.status);
    const internalNotes = normalizeNotes(body.internalNotes);

    if (!status && internalNotes === undefined) {
      return NextResponse.json(
        { ok: false, error: "Nada para atualizar." },
        { status: 400 }
      );
    }

    const existing = await prisma.vipWhatsappLead.findFirst({
      where: { id, team },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Cadastro não encontrado." },
        { status: 404 }
      );
    }

    const data: {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      internalNotes?: string | null;
      approvedAt?: Date | null;
      approvedById?: string | null;
    } = {};

    if (internalNotes !== undefined) {
      data.internalNotes = internalNotes;
    }

    if (status) {
      data.status = status;
      if (status === "APPROVED") {
        data.approvedAt = new Date();
        data.approvedById = sess.id;
      } else {
        data.approvedAt = null;
        data.approvedById = null;
      }
    }

    const updated = await prisma.vipWhatsappLead.update({
      where: { id: existing.id },
      data,
      include: {
        employee: { select: { id: true, name: true, login: true } },
        approvedBy: { select: { id: true, name: true, login: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        status: updated.status,
        internalNotes: updated.internalNotes,
        approvedAt: updated.approvedAt?.toISOString() || null,
        approvedBy: updated.approvedBy
          ? {
              id: updated.approvedBy.id,
              name: updated.approvedBy.name,
              login: updated.approvedBy.login,
            }
          : null,
        employee: {
          id: updated.employee.id,
          name: updated.employee.name,
          login: updated.employee.login,
        },
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao atualizar cadastro do Grupo VIP.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
