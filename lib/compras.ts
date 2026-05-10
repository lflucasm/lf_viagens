import { prisma } from "@/lib/prisma";
import type { PurchaseItem, Purchase } from "@prisma/client";

function roundInt(n: number) {
  return Math.round(n);
}

function asInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

function pointsForMilheiro(compra: Purchase) {
  const c: any = compra as any;
  const cia = (c.ciaAerea ?? c.ciaProgram ?? null) as string | null;

  if (cia === "LATAM") return asInt(c.saldoPrevistoLatam ?? c.expectedLatamPoints ?? c.pontosCiaTotal ?? 0);
  if (cia === "SMILES") return asInt(c.saldoPrevistoSmiles ?? c.expectedSmilesPoints ?? c.pontosCiaTotal ?? 0);
  if (cia === "LIVELO") return asInt(c.saldoPrevistoLivelo ?? c.pontosCiaTotal ?? 0);
  if (cia === "ESFERA") return asInt(c.saldoPrevistoEsfera ?? c.pontosCiaTotal ?? 0);

  return asInt(c.pontosCiaTotal ?? 0);
}

export async function recomputeCompra(purchaseId: string) {
  const compra = (await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  })) as (Purchase & { items: PurchaseItem[] }) | null;

  if (!compra) return null;

  // soma só itens que não estão cancelados
  const itensAtivos = (compra.items ?? []).filter((i) => i.status !== "CANCELED");

  const itemsCostCents = itensAtivos.reduce(
    (acc, i) => acc + asInt(i.amountCents, 0),
    0
  );

  /** Compras operacionais: custo = só itens (sem taxa cedente, sem comissão vendedor, sem markup). */
  const subtotalCents = itemsCostCents;
  const comissaoCents = 0;
  const totalCents = subtotalCents;

  const pontos = Math.max(0, pointsForMilheiro(compra));
  const custoMilheiroCents = pontos > 0 ? roundInt((totalCents * 1000) / pontos) : 0;
  const metaMilheiroCents = custoMilheiroCents;

  const updated = await prisma.purchase.update({
    where: { id: compra.id },
    data: {
      subtotalCents,
      comissaoCents,
      totalCents,
      custoMilheiroCents,
      metaMilheiroCents,
    },
  });

  return updated;
}
