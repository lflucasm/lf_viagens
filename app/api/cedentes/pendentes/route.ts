// app/api/cedentes/pendentes/route.ts
import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const items = await prisma.cedente.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,

        telefone: true,
        emailCriado: true,

        banco: true,
        pixTipo: true,
        chavePix: true,
        titularConfirmado: true,

        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,

        createdAt: true,

        // ✅ responsável para rateio (dono do cedente)
        owner: {
          select: {
            id: true,
            name: true,
            login: true,
            employeeId: true,
            team: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(
      { ok: true, data: { items, total: items.length } },
      { status: 200, headers: noCacheHeaders() }
    );
  } catch (e: any) {
    console.error("Erro GET /api/cedentes/pendentes:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar pendentes." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
