import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const exists = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!exists) return notFound("Compra não encontrada.");

    // (opcional) se quiser impedir cancelar compra liberada:
    // if (exists.status === "CLOSED") return badRequest("Compra já liberada não pode ser cancelada.");

    const compra = await prisma.purchase.update({
      where: { id },
      data: { status: "CANCELED" },
      include: { items: true },
    });

    // mantém consistência dos totais/saldos calculados
    await recomputeCompra(id);

    return ok({ compra });
  } catch (e: any) {
    return serverError("Falha ao cancelar compra.", { detail: e?.message });
  }
}
