import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Atualiza updatedAt do utilizador (sinal de que o painel está aberto).
 * Usado pela página inicial para presença aproximada da equipe.
 */
export async function POST() {
  const session = await getSessionServer();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  await prisma.$executeRaw(
    Prisma.sql`UPDATE "User" SET "updatedAt" = NOW() WHERE id = ${session.id}`
  );

  return NextResponse.json({ ok: true });
}
