import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
function ok(data: any) {
  return NextResponse.json({ ok: true, data }, { headers: noCacheHeaders() });
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}
function isHex(s: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(s || ""));
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido.");

  const userId = String(body.userId || "").trim();
  const colorHex = String(body.colorHex || "").trim();

  if (!userId) return bad("userId obrigatório.");
  if (!isHex(colorHex)) return bad("colorHex inválido. Use #RRGGBB.");

  const up = await prisma.agendaMemberColor.upsert({
    where: { team_userId: { team: session.team, userId } },
    create: { team: session.team, userId, colorHex },
    update: { colorHex },
  });

  return ok({ userId: up.userId, colorHex: up.colorHex });
}
