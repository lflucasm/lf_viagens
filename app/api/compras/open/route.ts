import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveCedenteId(cedenteKey: string): Promise<string | null> {
  const key = (cedenteKey || "").trim();
  if (!key) return null;

  const ced = await prisma.cedente.findFirst({
    where: { OR: [{ id: key }, { identificador: key }] },
    select: { id: true },
  });

  return ced?.id ?? null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cedenteKey = searchParams.get("cedenteId") || "";

  // ✅ aceita UUID ou "LUC-267"
  const cedenteIdResolved = await resolveCedenteId(cedenteKey);

  // se mandou cedenteId e não achou, retorna vazio
  if (cedenteKey.trim() && !cedenteIdResolved) {
    return NextResponse.json({ ok: true, compras: [] });
  }

  const compras = await prisma.purchase.findMany({
    where: {
      status: "OPEN",
      ...(cedenteIdResolved ? { cedenteId: cedenteIdResolved } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      numero: true,
      status: true,
      ciaAerea: true,
      metaMilheiroCents: true,
      custoMilheiroCents: true,
      metaMarkupCents: true,
    },
    take: 80,
  });

  return NextResponse.json({ ok: true, compras });
}
