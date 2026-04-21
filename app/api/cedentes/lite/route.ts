import { NextResponse } from "next/server";
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

export async function GET() {
  const session = await requireSession();

  const rows = await prisma.cedente.findMany({
    where: {
      owner: { team: session.team },
      status: { in: ["PENDING", "APPROVED"] },
    },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
    },
    orderBy: [{ nomeCompleto: "asc" }],
    take: 5000,
  });

  return NextResponse.json({ ok: true, rows }, { headers: noCacheHeaders() });
}
