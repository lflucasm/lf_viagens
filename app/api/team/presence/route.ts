import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ONLINE_MS = 3 * 60 * 1000;

export async function GET() {
  const session = await getSessionServer();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const rows = await prisma.user.findMany({
    where: {
      team: session.team,
      role: { in: ["admin", "staff"] },
    },
    select: { id: true, name: true, login: true, updatedAt: true },
    orderBy: { name: "asc" },
  });

  const now = Date.now();
  const members = rows.map((r) => ({
    id: r.id,
    name: r.name,
    login: r.login,
    updatedAt: r.updatedAt.toISOString(),
    isOnline: now - r.updatedAt.getTime() < ONLINE_MS,
  }));

  return NextResponse.json(
    { ok: true, members },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
