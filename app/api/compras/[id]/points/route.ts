import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import type { LoyaltyProgram, PurchaseItemStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function jsonSafe<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

function programKey(cia: LoyaltyProgram) {
  if (cia === "LATAM") return "LATAM";
  if (cia === "SMILES") return "SMILES";
  if (cia === "LIVELO") return "LIVELO";
  return "ESFERA";
}

function getAppliedOrPredictedPoints(p: any, cia: LoyaltyProgram, fallback: number) {
  const key = programKey(cia);

  const aplicado = safeInt(p?.[`saldoAplicado${key}`], 0);
  if (aplicado > 0) return aplicado;

  const previsto = safeInt(p?.[`saldoPrevisto${key}`], 0);
  if (previsto > 0) return previsto;

  return fallback;
}

async function recalcPurchaseTotals(tx: any, purchaseId: string) {
  const p = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!p) return;

  const cia = p.ciaAerea as LoyaltyProgram | null;
  const items = (p.items || []).filter((it: any) => it.status !== "CANCELED");

  // total de pontos no programa da compra
  const pontosCiaTotal =
    cia == null
      ? 0
      : items
          .filter((it: any) => it.programTo === cia)
          .reduce((acc: number, it: any) => acc + safeInt(it.pointsFinal, 0), 0);

  // custos
  const itemsCost = items.reduce((acc: number, it: any) => acc + safeInt(it.amountCents, 0), 0);

  const cedentePayCents = safeInt(p.cedentePayCents, 0);
  const vendorCommissionBps = safeInt(p.vendorCommissionBps, 0);
  const metaMarkupCents = safeInt(p.metaMarkupCents, 0);

  const subtotalCents = itemsCost + cedentePayCents;
  const comissaoCents = Math.round((subtotalCents * vendorCommissionBps) / 10000);
  const totalCents = subtotalCents + comissaoCents;

  // custo milheiro usando saldoAplicado/previsto quando existir, senão usa pontosCiaTotal
  const ptsBase = cia ? getAppliedOrPredictedPoints(p, cia, pontosCiaTotal) : pontosCiaTotal;
  const denom = ptsBase > 0 ? ptsBase / 1000 : 0;

  const custoMilheiroCents = denom > 0 ? Math.round(totalCents / denom) : 0;

  // meta milheiro: se for 0 (default) ou menor que custo (quando antes era markup), recalcula como custo+markup
  const metaAtual = safeInt(p.metaMilheiroCents, 0);
  const metaCalc = custoMilheiroCents + metaMarkupCents;
  const metaMilheiroCents =
    metaAtual <= 0 ? metaCalc : custoMilheiroCents > 0 && metaAtual < custoMilheiroCents ? metaCalc : metaAtual;

  await tx.purchase.update({
    where: { id: purchaseId },
    data: {
      pontosCiaTotal,
      subtotalCents,
      comissaoCents,
      totalCents,
      custoMilheiroCents,
      metaMilheiroCents,
    },
  });
}

/**
 * GET /api/compras/:id/points
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { id: purchaseId } = await params;

    const compra = await prisma.purchase.findFirst({
      where: { id: purchaseId, cedente: { owner: { team: session.team } } },
      include: { items: true },
    });

    if (!compra) {
      return NextResponse.json({ ok: false, error: "Compra não encontrada." }, { status: 404 });
    }

    const cia = compra.ciaAerea ?? null;

    const items = (compra.items || [])
      .filter((it: any) => it.type === "POINTS_BUY" && it.status !== "CANCELED")
      .map((it: any) => ({
        id: it.id,
        title: String(it.title || "Compra de pontos"),
        pointsFinal: safeInt(it.pointsFinal, 0),
        amountCents: safeInt(it.amountCents, 0),
      }));

    return NextResponse.json(
      jsonSafe({
        ok: true,
        compra: {
          id: compra.id,
          numero: compra.numero,
          status: compra.status,
          ciaProgram: cia,
        },
        items,
      })
    );
  } catch (e: any) {
    console.error("GET /api/compras/[id]/points FAIL", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Falha ao carregar itens." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/compras/:id/points
 * body: { items: [{id?, title, pointsFinal, amountCents}], deleteIds: string[] }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireSession();
    const { id: purchaseId } = await params;

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    const deleteIds = Array.isArray(body?.deleteIds) ? body.deleteIds : [];

    const compra = await prisma.purchase.findFirst({
      where: { id: purchaseId, cedente: { owner: { team: session.team } } },
      include: { items: true, cedente: true },
    });

    if (!compra) return NextResponse.json({ ok: false, error: "Compra não encontrada." }, { status: 404 });
    if (compra.status === "CANCELED") return NextResponse.json({ ok: false, error: "Compra cancelada." }, { status: 400 });

    if (compra.status !== "OPEN" && compra.status !== "CLOSED") {
      return NextResponse.json(
        { ok: false, error: "Compra travada (status não permite comprar mais)." },
        { status: 400 }
      );
    }

    const cia = compra.ciaAerea as LoyaltyProgram | null;
    if (!cia) {
      return NextResponse.json({ ok: false, error: "Defina a CIA da compra primeiro." }, { status: 400 });
    }

    const existing = (compra.items || []).filter((it: any) => it.type === "POINTS_BUY");
    const byId = new Map<string, any>();
    for (const it of existing) byId.set(it.id, it);

    let deltaPoints = 0;

    await prisma.$transaction(async (tx) => {
      // deletar
      for (const delId of deleteIds) {
        const old = byId.get(delId);
        if (!old) continue;
        deltaPoints -= safeInt(old.pointsFinal, 0);
        await tx.purchaseItem.delete({ where: { id: delId } });
      }

      const newStatus: PurchaseItemStatus = compra.status === "CLOSED" ? "RELEASED" : "PENDING";

      // upsert
      for (const raw of items) {
        const id = typeof raw?.id === "string" ? raw.id : null;
        const title = String(raw?.title || "Compra de pontos").trim();
        const pointsFinal = safeInt(raw?.pointsFinal, 0);
        const amountCents = safeInt(raw?.amountCents, 0);
        if (pointsFinal <= 0) continue;

        if (id && byId.has(id)) {
          const old = byId.get(id);
          const oldPts = safeInt(old?.pointsFinal, 0);
          deltaPoints += pointsFinal - oldPts;

          await tx.purchaseItem.update({
            where: { id },
            data: {
              title,
              pointsBase: pointsFinal,
              pointsFinal,
              amountCents,
              programTo: cia,
              type: "POINTS_BUY",
            },
          });
        } else {
          deltaPoints += pointsFinal;

          await tx.purchaseItem.create({
            data: {
              purchaseId,
              type: "POINTS_BUY",
              status: newStatus,
              title,
              pointsBase: pointsFinal,
              pointsFinal,
              pointsDebitedFromOrigin: 0,
              amountCents,
              programTo: cia,
            },
          });
        }
      }

      // ✅ se já está LIBERADA: aplica delta no saldo do cedente + marca saldoAplicadoX na compra
      if (compra.status === "CLOSED" && deltaPoints !== 0) {
        const cedenteId = compra.cedenteId;

        const patchPurchase: any = {};
        if (cia === "LATAM") {
          await tx.cedente.update({ where: { id: cedenteId }, data: { pontosLatam: { increment: deltaPoints } } });
          patchPurchase.saldoAplicadoLatam = safeInt((compra as any).saldoAplicadoLatam, 0) + deltaPoints;
        } else if (cia === "SMILES") {
          await tx.cedente.update({ where: { id: cedenteId }, data: { pontosSmiles: { increment: deltaPoints } } });
          patchPurchase.saldoAplicadoSmiles = safeInt((compra as any).saldoAplicadoSmiles, 0) + deltaPoints;
        } else if (cia === "LIVELO") {
          await tx.cedente.update({ where: { id: cedenteId }, data: { pontosLivelo: { increment: deltaPoints } } });
          patchPurchase.saldoAplicadoLivelo = safeInt((compra as any).saldoAplicadoLivelo, 0) + deltaPoints;
        } else if (cia === "ESFERA") {
          await tx.cedente.update({ where: { id: cedenteId }, data: { pontosEsfera: { increment: deltaPoints } } });
          patchPurchase.saldoAplicadoEsfera = safeInt((compra as any).saldoAplicadoEsfera, 0) + deltaPoints;
        }

        await tx.purchase.update({ where: { id: purchaseId }, data: patchPurchase });
      }

      // recalcula totais/custos/meta
      await recalcPurchaseTotals(tx, purchaseId);
    });

    return NextResponse.json({ ok: true, deltaPoints });
  } catch (e: any) {
    console.error("POST /api/compras/[id]/points FAIL", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Falha ao salvar compra de pontos." },
      { status: 500 }
    );
  }
}
