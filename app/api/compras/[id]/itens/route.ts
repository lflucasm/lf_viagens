import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!compra) return notFound("Compra não encontrada.");

    const itens = await prisma.purchaseItem.findMany({
      where: { purchaseId: id },
      orderBy: { createdAt: "asc" },
    });

    return ok({ itens });
  } catch (e: any) {
    return serverError("Falha ao listar itens.", { detail: e?.message });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const compra = await prisma.purchase.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!compra) return notFound("Compra não encontrada.");
    if (compra.status !== "OPEN") return badRequest("Só pode adicionar itens com a compra em OPEN.");

    const type = body.type;
    const title = String(body.title || "").trim();
    if (!type) return badRequest("type é obrigatório.");
    if (!title) return badRequest("title é obrigatório.");

    const item = await prisma.purchaseItem.create({
      data: {
        purchaseId: id,
        type,
        status: body.status ?? "PENDING",

        programFrom: body.programFrom ?? null,
        programTo: body.programTo ?? null,

        pointsBase: Number(body.pointsBase || 0),
        bonusMode: body.bonusMode ?? null,
        bonusValue: body.bonusValue === undefined ? null : Number(body.bonusValue),
        pointsFinal: Number(body.pointsFinal || 0),

        amountCents: Number(body.amountCents || 0),
        transferMode: body.transferMode ?? null,
        pointsDebitedFromOrigin: Number(body.pointsDebitedFromOrigin || 0),

        title,
        details: body.details ? String(body.details) : null,
      },
    });

    await recomputeCompra(id);

    return ok({ item }, 201);
  } catch (e: any) {
    return serverError("Falha ao criar item.", { detail: e?.message });
  }
}
