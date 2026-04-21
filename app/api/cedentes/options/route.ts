import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Cedentes para SELECT na tela de bloqueios
 * -> mesmos cedentes do "visualizar" (na prática: não rejeitados)
 * -> ordenado por nome
 * -> inclui pontos para pré-visualização no front
 */
export async function GET() {
  try {
    const data = await prisma.cedente.findMany({
      where: {
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        identificador: true,

        // ✅ pontos para preview
        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,
      },
      orderBy: { nomeCompleto: "asc" },
      take: 5000,
    });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar options" },
      { status: 500 }
    );
  }
}
