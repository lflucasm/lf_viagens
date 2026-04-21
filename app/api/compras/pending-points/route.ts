import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth-server";
import { LoyaltyProgram } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await requireSession();

    // Cedentes por programa (mesma lógica das telas de visualização).
    const [latamCedentes, smilesCedentes] = await Promise.all([
      prisma.cedente.findMany({
        where: {
          status: "APPROVED",
          owner: { team: session.team },
          OR: [{ pontosLatam: { gt: 0 } }, { senhaLatamPass: { not: null } }],
        },
        select: { id: true },
      }),
      prisma.cedente.findMany({
        where: {
          status: "APPROVED",
          owner: { team: session.team },
          OR: [{ pontosSmiles: { gt: 0 } }, { senhaSmiles: { not: null } }],
        },
        select: { id: true },
      }),
    ]);

    const latamCedenteIds = new Set(latamCedentes.map((c) => c.id));
    const smilesCedenteIds = new Set(smilesCedentes.map((c) => c.id));
    const allCedenteIds = Array.from(new Set([...latamCedenteIds, ...smilesCedenteIds]));

    if (allCedenteIds.length === 0) {
      return ok({ latamPoints: 0, smilesPoints: 0, latamCount: 0, smilesCount: 0 });
    }

    // Base principal: itens pendentes de compras OPEN.
    const pendingItems = await prisma.purchaseItem.findMany({
      where: {
        status: "PENDING",
        pointsFinal: { gt: 0 },
        purchase: {
          status: "OPEN",
          cedenteId: { in: allCedenteIds },
        },
        OR: [
          { programTo: { in: [LoyaltyProgram.LATAM, LoyaltyProgram.SMILES] } },
          {
            programTo: null,
            purchase: { ciaAerea: { in: [LoyaltyProgram.LATAM, LoyaltyProgram.SMILES] } },
          },
        ],
      },
      select: {
        programTo: true,
        pointsFinal: true,
        purchaseId: true,
        purchase: { select: { ciaAerea: true, cedenteId: true } },
      },
    });

    let latamPoints = 0;
    let smilesPoints = 0;
    const latamPurchases = new Set<string>();
    const smilesPurchases = new Set<string>();

    for (const item of pendingItems) {
      const pts = Number(item.pointsFinal || 0);
      if (!pts) continue;

      const program = item.programTo ?? item.purchase.ciaAerea ?? null;
      if (
        program === LoyaltyProgram.LATAM &&
        latamCedenteIds.has(item.purchase.cedenteId)
      ) {
        latamPoints += pts;
        latamPurchases.add(item.purchaseId);
      } else if (
        program === LoyaltyProgram.SMILES &&
        smilesCedenteIds.has(item.purchase.cedenteId)
      ) {
        smilesPoints += pts;
        smilesPurchases.add(item.purchaseId);
      }
    }

    // Fallback: se a compra OPEN não tiver itens pendentes lançados, usa pontosCiaTotal.
    const openPurchases = await prisma.purchase.findMany({
      where: {
        status: "OPEN",
        pontosCiaTotal: { gt: 0 },
        ciaAerea: { in: [LoyaltyProgram.LATAM, LoyaltyProgram.SMILES] },
        cedenteId: { in: allCedenteIds },
      },
      select: { id: true, cedenteId: true, ciaAerea: true, pontosCiaTotal: true },
    });

    for (const purchase of openPurchases) {
      const points = Number(purchase.pontosCiaTotal || 0);
      if (!points || !purchase.ciaAerea) continue;

      if (
        purchase.ciaAerea === LoyaltyProgram.LATAM &&
        latamCedenteIds.has(purchase.cedenteId) &&
        !latamPurchases.has(purchase.id)
      ) {
        latamPoints += points;
        latamPurchases.add(purchase.id);
      }

      if (
        purchase.ciaAerea === LoyaltyProgram.SMILES &&
        smilesCedenteIds.has(purchase.cedenteId) &&
        !smilesPurchases.has(purchase.id)
      ) {
        smilesPoints += points;
        smilesPurchases.add(purchase.id);
      }
    }

    const latamCount = latamPurchases.size;
    const smilesCount = smilesPurchases.size;

    // ✅ padrão do teu sistema: { ok:true, data:{...} }
    return ok({ latamPoints, smilesPoints, latamCount, smilesCount });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e || "");
    return serverError("Falha ao calcular pontos pendentes (compras OPEN).", {
      detail,
    });
  }
}
