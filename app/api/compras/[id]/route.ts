import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";

export const dynamic = "force-dynamic";

/**
 * =========================
 * MAP DB -> UI
 * =========================
 */
function mapDbToUi(compra: any) {
  return {
    id: compra.id,
    numero: compra.numero,
    status: compra.status,

    cedenteId: compra.cedenteId,

    ciaProgram: compra.ciaAerea ?? null,
    ciaPointsTotal: Number(compra.pontosCiaTotal || 0),

    cedentePayCents: Number(compra.cedentePayCents || 0),
    vendorCommissionBps: Number(compra.vendorCommissionBps || 0),
    targetMarkupCents: Number(compra.metaMarkupCents || 0),

    subtotalCostCents: Number(compra.subtotalCents || 0),
    vendorCommissionCents: Number(compra.comissaoCents || 0),
    totalCostCents: Number(compra.totalCents || 0),

    costPerKiloCents: Number(compra.custoMilheiroCents || 0),
    targetPerKiloCents: Number(compra.metaMilheiroCents || 0),

    // UI usa expected*, DB usa saldoPrevisto*
    expectedLatamPoints: compra.saldoPrevistoLatam ?? null,
    expectedSmilesPoints: compra.saldoPrevistoSmiles ?? null,
    expectedLiveloPoints: compra.saldoPrevistoLivelo ?? null,
    expectedEsferaPoints: compra.saldoPrevistoEsfera ?? null,

    note: compra.observacao ?? null,
    items: Array.isArray(compra.items) ? compra.items : [],
  };
}

/**
 * =========================
 * MAP ITEM CREATE
 * =========================
 */
function mapItemCreate(it: any) {
  return {
    type: it.type,
    title: String(it.title || ""),
    details: it.details ? String(it.details) : null,

    programFrom: it.programFrom ?? null,
    programTo: it.programTo ?? null,

    pointsBase: Number(it.pointsBase || 0),
    bonusMode: it.bonusMode ?? null,
    bonusValue: it.bonusValue ?? null,
    pointsFinal: Number(it.pointsFinal || 0),

    transferMode: it.transferMode ?? null,
    pointsDebitedFromOrigin: Number(it.pointsDebitedFromOrigin || 0),

    amountCents: Number(it.amountCents || 0),
  };
}

function scoreMedia(score?: {
  rapidezBiometria?: number;
  rapidezSms?: number;
  resolucaoProblema?: number;
  confianca?: number;
} | null) {
  const a = Number(score?.rapidezBiometria || 0);
  const b = Number(score?.rapidezSms || 0);
  const c = Number(score?.resolucaoProblema || 0);
  const d = Number(score?.confianca || 0);
  const avg = (a + b + c + d) / 4;
  return Math.round(avg * 100) / 100;
}

function mapCedenteWithScore(cedente: any) {
  if (!cedente) return null;
  return {
    id: cedente.id,
    identificador: cedente.identificador,
    nomeCompleto: cedente.nomeCompleto,
    cpf: cedente.cpf,
    pontosLatam: Number(cedente.pontosLatam || 0),
    pontosSmiles: Number(cedente.pontosSmiles || 0),
    pontosLivelo: Number(cedente.pontosLivelo || 0),
    pontosEsfera: Number(cedente.pontosEsfera || 0),
    scoreMedia: scoreMedia(cedente.score),
  };
}

/**
 * =========================
 * GET
 * =========================
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosLatam: true,
            pontosSmiles: true,
            pontosLivelo: true,
            pontosEsfera: true,
            score: {
              select: {
                rapidezBiometria: true,
                rapidezSms: true,
                resolucaoProblema: true,
                confianca: true,
              },
            },
          },
        },
        items: true,
      },
    });

    if (!compra) return notFound("Compra não encontrada.");
    return ok({ compra: mapDbToUi(compra), cedente: mapCedenteWithScore(compra.cedente) });
  } catch (e: any) {
    return serverError("Falha ao buscar compra.", { detail: e?.message });
  }
}

/**
 * =========================
 * PATCH
 * =========================
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const exists = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) return notFound("Compra não encontrada.");

    const items = Array.isArray(body.items) ? body.items : null;

    await prisma.purchase.update({
      where: { id },
      data: {
        ciaAerea: body.ciaProgram === undefined ? undefined : body.ciaProgram,
        pontosCiaTotal:
          body.ciaPointsTotal === undefined ? undefined : Number(body.ciaPointsTotal || 0),

        cedentePayCents:
          body.cedentePayCents === undefined ? undefined : Number(body.cedentePayCents || 0),

        vendorCommissionBps:
          body.vendorCommissionBps === undefined
            ? undefined
            : Number(body.vendorCommissionBps || 0),

        metaMarkupCents:
          body.targetMarkupCents === undefined
            ? undefined
            : Number(body.targetMarkupCents || 0),

        observacao: body.note === undefined ? undefined : body.note ? String(body.note) : null,

        // SALDO PREVISTO (nomes do Prisma)
        saldoPrevistoLatam:
          body.expectedLatamPoints === undefined ? undefined : body.expectedLatamPoints,
        saldoPrevistoSmiles:
          body.expectedSmilesPoints === undefined ? undefined : body.expectedSmilesPoints,
        saldoPrevistoLivelo:
          body.expectedLiveloPoints === undefined ? undefined : body.expectedLiveloPoints,
        saldoPrevistoEsfera:
          body.expectedEsferaPoints === undefined ? undefined : body.expectedEsferaPoints,

        // totais
        subtotalCents:
          body.subtotalCostCents === undefined
            ? undefined
            : Number(body.subtotalCostCents || 0),
        comissaoCents:
          body.vendorCommissionCents === undefined
            ? undefined
            : Number(body.vendorCommissionCents || 0),
        totalCents:
          body.totalCostCents === undefined ? undefined : Number(body.totalCostCents || 0),

        custoMilheiroCents:
          body.costPerKiloCents === undefined
            ? undefined
            : Number(body.costPerKiloCents || 0),
        metaMilheiroCents:
          body.targetPerKiloCents === undefined
            ? undefined
            : Number(body.targetPerKiloCents || 0),

        status: body.status === undefined ? undefined : body.status,

        ...(items
          ? {
              items: {
                deleteMany: {},
                create: items.map(mapItemCreate),
              },
            }
          : {}),
      },
    });

    await recomputeCompra(id);

    const compraFinal = await prisma.purchase.findUnique({
      where: { id },
      include: {
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosLatam: true,
            pontosSmiles: true,
            pontosLivelo: true,
            pontosEsfera: true,
            score: {
              select: {
                rapidezBiometria: true,
                rapidezSms: true,
                resolucaoProblema: true,
                confianca: true,
              },
            },
          },
        },
        items: true,
      },
    });

    if (!compraFinal) return notFound("Compra não encontrada.");
    return ok({ compra: mapDbToUi(compraFinal), cedente: mapCedenteWithScore(compraFinal.cedente) });
  } catch (e: any) {
    return serverError("Falha ao atualizar compra.", { detail: e?.message });
  }
}

/**
 * =========================
 * DELETE (CANCELAR)
 * =========================
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    const compra = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!compra) return notFound("Compra não encontrada.");

    // não cancela liberada
    if (compra.status === "CLOSED") {
      return badRequest("Compra liberada não pode ser cancelada.");
    }

    // idempotente
    if (compra.status === "CANCELED") {
      return ok({ ok: true });
    }

    const updated = await prisma.purchase.update({
      where: { id },
      data: { status: "CANCELED" },
      include: { items: true },
    });

    // mantém consistência de totais/snapshot se você usa isso em algum lugar
    await recomputeCompra(id);

    return ok({ compra: updated });
  } catch (e: any) {
    return serverError("Falha ao cancelar compra.", { detail: e?.message });
  }
}
