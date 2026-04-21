import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await ctx.params;
    if (!id || !itemId) return badRequest("id e itemId são obrigatórios.");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const item = await prisma.purchaseItem.findFirst({
      where: { id: itemId, purchaseId: id },
    });
    if (!item) return notFound("Item não encontrado.");

    const updated = await prisma.purchaseItem.update({
      where: { id: itemId },
      data: {
        status: body.status === undefined ? undefined : body.status,

        programFrom: body.programFrom === undefined ? undefined : body.programFrom,
        programTo: body.programTo === undefined ? undefined : body.programTo,

        pointsBase: body.pointsBase === undefined ? undefined : Number(body.pointsBase || 0),
        bonusMode: body.bonusMode === undefined ? undefined : body.bonusMode,
        bonusValue: body.bonusValue === undefined ? undefined : (body.bonusValue === null ? null : Number(body.bonusValue)),
        pointsFinal: body.pointsFinal === undefined ? undefined : Number(body.pointsFinal || 0),

        amountCents: body.amountCents === undefined ? undefined : Number(body.amountCents || 0),
        transferMode: body.transferMode === undefined ? undefined : body.transferMode,
        pointsDebitedFromOrigin:
          body.pointsDebitedFromOrigin === undefined ? undefined : Number(body.pointsDebitedFromOrigin || 0),

        title: body.title === undefined ? undefined : String(body.title || "").trim(),
        details: body.details === undefined ? undefined : (body.details ? String(body.details) : null),
      },
    });

    await recomputeCompra(id);

    return ok({ item: updated });
  } catch (e: any) {
    return serverError("Falha ao atualizar item.", { detail: e?.message });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await ctx.params;
    if (!id || !itemId) return badRequest("id e itemId são obrigatórios.");

    const item = await prisma.purchaseItem.findFirst({
      where: { id: itemId, purchaseId: id },
      select: { id: true },
    });
    if (!item) return notFound("Item não encontrado.");

    // em vez de apagar físico, marca como CANCELED
    const updated = await prisma.purchaseItem.update({
      where: { id: itemId },
      data: { status: "CANCELED" },
    });

    await recomputeCompra(id);

    return ok({ item: updated });
  } catch (e: any) {
    return serverError("Falha ao cancelar item.", { detail: e?.message });
  }
}
