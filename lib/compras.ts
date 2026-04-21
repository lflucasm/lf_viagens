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

  // ✅ igual ao frontend: subtotal = itens + taxa do cedente
  const subtotalCents = itemsCostCents + asInt((compra as any).cedentePayCents, 0);

  // ✅ igual ao frontend: comissão em cima do subtotal
  const comissaoCents = roundInt(
    (subtotalCents * asInt((compra as any).vendorCommissionBps, 0)) / 10000
  );

  // ✅ igual ao frontend: total = subtotal + comissão
  const totalCents = subtotalCents + comissaoCents;

  // ✅ milheiro usa "Esperado" da CIA (quando existir)
  const pontos = Math.max(0, pointsForMilheiro(compra));
  const custoMilheiroCents = pontos > 0 ? roundInt((totalCents * 1000) / pontos) : 0;

  // ✅ meta = custoMilheiro + markup
  const metaMilheiroCents = custoMilheiroCents + asInt((compra as any).metaMarkupCents, 0);

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
