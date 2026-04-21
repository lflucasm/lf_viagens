import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";
import { LoyaltyProgram, EmissionSource } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const saleId = String(body?.saleId || "").trim();
    const keepPassengers = body?.keepPassengers !== false; // default: true

    if (!saleId) return badRequest("saleId é obrigatório.");

    const venda = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { receivable: true },
    });

    if (!venda) return badRequest("Venda não encontrada.");

    // se já estiver cancelada, idempotente
    if (venda.paymentStatus === "CANCELED") {
      return ok({ ok: true, alreadyCanceled: true });
    }

    // ✅ 1) estornar pontos (sempre volta pontos)
    if (venda.points > 0) {
      const inc = venda.points;

      if (venda.program === LoyaltyProgram.LATAM) {
        await prisma.cedente.update({ where: { id: venda.cedenteId }, data: { pontosLatam: { increment: inc } } });
      } else if (venda.program === LoyaltyProgram.SMILES) {
        await prisma.cedente.update({ where: { id: venda.cedenteId }, data: { pontosSmiles: { increment: inc } } });
      } else if (venda.program === LoyaltyProgram.LIVELO) {
        await prisma.cedente.update({ where: { id: venda.cedenteId }, data: { pontosLivelo: { increment: inc } } });
      } else if (venda.program === LoyaltyProgram.ESFERA) {
        await prisma.cedente.update({ where: { id: venda.cedenteId }, data: { pontosEsfera: { increment: inc } } });
      }
    }

    // ✅ 2) pax: só desfaz se for "cadastro errado"
    // Como você já conta pax por EmissionEvent, aqui a gente remove o evento de emissão.
    // (Sem mexer no prisma) fazemos um match pelo dia + pax + source=SALE.
    let removedEmission = false;

    if (!keepPassengers && venda.passengers > 0) {
      const d = new Date(venda.date);
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

      const ev = await prisma.emissionEvent.findFirst({
        where: {
          cedenteId: venda.cedenteId,
          program: venda.program,
          source: EmissionSource.SALE,
          passengersCount: venda.passengers,
          issuedAt: { gte: start, lte: end },
        },
        orderBy: { createdAt: "desc" },
      });

      if (ev) {
        await prisma.emissionEvent.delete({ where: { id: ev.id } });
        removedEmission = true;
      }
    }

    // ✅ 3) cancelar recebível (se existir)
    if (venda.receivableId) {
      await prisma.receivable.update({
        where: { id: venda.receivableId },
        data: {
          status: "CANCELED",
          balanceCents: 0,
        },
      });
    }

    // ✅ 4) cancelar venda
    await prisma.sale.update({
      where: { id: venda.id },
      data: {
        paymentStatus: "CANCELED",
        paidAt: null,
      },
    });

    return ok({ ok: true, removedEmission });
  } catch (e: any) {
    console.error(e);
    return serverError("Falha ao cancelar venda.", { detail: e?.message });
  }
}
