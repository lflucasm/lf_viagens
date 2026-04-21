// app/api/cedentes/mini/route.ts
import { NextRequest, NextResponse } from "next/server";
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
function bad(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: noCacheHeaders() }
  );
}

export async function GET(_req: NextRequest) {
  const session = await requireSession();

  // ✅ lista todos os cedentes do time
  const rows = await prisma.cedente.findMany({
    where: { owner: { team: session.team } },
    orderBy: [{ nomeCompleto: "asc" }],
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true, // ✅ seu front espera cpf
    },
    take: 5000,
  });

  return NextResponse.json({ ok: true, rows }, { headers: noCacheHeaders() });
}
