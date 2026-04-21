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
        throw new Error("Não é possível cancelar uma comissão PAID.");
      }

      if (c.status === "CANCELED") {
        // idempotente
        return await tx.cedenteCommission.findUnique({ where: { id } });
      }

      return await tx.cedenteCommission.update({
        where: { id },
        data: {
          status: "CANCELED",
          note: note || c.note,
          // opcionalmente limpa pagamento
          paidAt: null,
          paidById: null,
          // (se quiser registrar quem cancelou, dá pra criar campos canceledById/canceledAt no schema)
        },
      });
    });

    if (!updated) return notFound("Comissão não encontrada.");
    return ok({ commission: updated });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("PAID")) return badRequest(msg);
    return serverError("Falha ao cancelar comissão.", { detail: e?.message });
  }
}
