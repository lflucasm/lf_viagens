import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { getSessionServer } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Body opcional:
 * { note?: string }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const session = await getSessionServer();
    const userId = String(session?.id || "");
    if (!userId) return badRequest("Sessão inválida: faça login novamente.");

    const body = await req.json().catch(() => ({} as any));
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.cedenteCommission.findUnique({ where: { id } });
      if (!c) return null;

      if (c.status === "PAID") {
        // idempotente: devolve o que já está pago
        return await tx.cedenteCommission.findUnique({
          where: { id },
          include: {
            cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
            purchase: { select: { id: true, numero: true, status: true } },
            generatedBy: { select: { id: true, name: true, login: true } },
            paidBy: { select: { id: true, name: true, login: true } },
          },
        });
      }

      if (c.status === "CANCELED") {
        throw new Error("Não é possível pagar uma comissão CANCELED.");
      }

      return await tx.cedenteCommission.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paidById: userId,
          note: note || c.note,
        },
        include: {
          cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
          purchase: { select: { id: true, numero: true, status: true } },
          generatedBy: { select: { id: true, name: true, login: true } },
          paidBy: { select: { id: true, name: true, login: true } },
        },
      });
    });

    if (!updated) return notFound("Comissão não encontrada.");
    return ok({ commission: updated });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("CANCELED")) return badRequest(msg);
    return serverError("Falha ao pagar comissão.", { detail: e?.message });
  }
}
