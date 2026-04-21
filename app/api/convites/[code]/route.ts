import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET(_req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;

    const invite = await prisma.employeeInvite.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        isActive: true,
        uses: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            login: true,
            employeeId: true, // ⚠️ precisa existir no schema (User)
            team: true,
            role: true,
          },
        },
      },
    });

    if (!invite || !invite.isActive) {
      return NextResponse.json(
        { ok: false, error: "Convite inválido ou inativo." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          inviteId: invite.id,
          code: invite.code,
          uses: invite.uses,
          lastUsedAt: invite.lastUsedAt,
          responsavel: {
            id: invite.user.id,
            name: invite.user.name,
            login: invite.user.login,
            employeeId: invite.user.employeeId ?? null,
            team: invite.user.team,
            role: invite.user.role,
          },
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    console.error("Erro GET /api/convites/[code]:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao validar convite." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
