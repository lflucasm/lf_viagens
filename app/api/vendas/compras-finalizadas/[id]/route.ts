import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function milheiroFrom(points: number, pointsValueCents: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValueCents, 0);
  if (!pts || !cents) return 0;
  return Math.round((cents * 1000) / pts);
}

function bonus30(points: number, milheiroCents: number, metaMilheiroCents: number) {
  const pts = safeInt(points, 0);
  const mil = safeInt(milheiroCents, 0);
  const meta = safeInt(metaMilheiroCents, 0);
  if (!pts || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

type RateioPlanItem = {
  payeeId: string;
  bps: number;
  payee: { id: string; name: string; login: string };
};

function splitByBps(totalCents: number, items: Array<{ bps: number }>) {
  // divide e corrige arredondamento no último item
  const total = safeInt(totalCents, 0);
  if (!items.length) return [];

  const raw = items.map((it) => Math.round((total * safeInt(it.bps, 0)) / 10000));
  const sum = raw.reduce((a, b) => a + b, 0);
  const diff = total - sum;

  if (diff !== 0) raw[raw.length - 1] = raw[raw.length - 1] + diff;
  return raw;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const purchaseId = String(id || "").trim();
  if (!purchaseId) {
    return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
  }

  const p = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      finalizedAt: { not: null },
      cedente: { owner: { team: session.team } },
    },
    select: {
      id: true,
      numero: true,
      status: true,
      ciaAerea: true,
      pontosCiaTotal: true,
      metaMilheiroCents: true,
      totalCents: true,
      observacao: true,

      finalizedAt: true,
      finalizedBy: { select: { id: true, name: true, login: true } },

      cedente: {
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          ownerId: true,
          owner: { select: { id: true, name: true, login: true } },
        },
      },

      createdAt: true,
      updatedAt: true,
    },
  });

  if (!p) {
    return NextResponse.json({ ok: false, error: "Compra não encontrada" }, { status: 404 });
  }

  const finalizedAt = p.finalizedAt ?? new Date();

  // vendas (não canceladas)
  const sales = await prisma.sale.findMany({
    where: {
      purchaseId: p.id,
      paymentStatus: { not: "CANCELED" },
    },
    select: {
      id: true,
      date: true,
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
      embarqueFeeCents: true,
      paymentStatus: true,
      locator: true,
    },
    orderBy: { date: "asc" },
  });

  // agrega igual lista
  let soldPoints = 0;
  let pax = 0;

  let salesTotalCents = 0;
  let salesPointsValueCents = 0;
  let salesTaxesCents = 0;

  let bonusCents = 0;

  for (const s of sales) {
    const total = safeInt(s.totalCents, 0);
    const fee = safeInt(s.embarqueFeeCents, 0);
    let pv = safeInt(s.pointsValueCents as unknown, 0);

    if (pv <= 0 && total > 0) {
      const cand = Math.max(total - fee, 0);
      pv = cand > 0 ? cand : total;
    }

    const taxes = Math.max(total - pv, 0);

    soldPoints += safeInt(s.points, 0);
    pax += safeInt(s.passengers, 0);

    salesTotalCents += total;
    salesPointsValueCents += pv;
    salesTaxesCents += taxes;

    const mil = milheiroFrom(safeInt(s.points, 0), pv);
    bonusCents += bonus30(safeInt(s.points, 0), mil, safeInt(p.metaMilheiroCents, 0));
  }

  const purchaseTotalCents = safeInt(p.totalCents, 0);

  const profitBrutoCents = salesPointsValueCents - purchaseTotalCents; // ✅ sem taxa
  const profitLiquidoCents = profitBrutoCents - bonusCents; // ✅ sem taxa - bônus

  const avgMilheiroCents =
    soldPoints > 0 && salesPointsValueCents > 0
      ? Math.round((salesPointsValueCents * 1000) / soldPoints)
      : null;

  const remainingPoints =
    safeInt(p.pontosCiaTotal, 0) > 0 ? Math.max(safeInt(p.pontosCiaTotal, 0) - soldPoints, 0) : null;

  // ✅ rateio vigente na data de finalização
  const ownerId = p.cedente.ownerId;

  const plan = await prisma.profitShare.findFirst({
    where: {
      team: session.team,
      ownerId,
      isActive: true,
      effectiveFrom: { lte: finalizedAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: finalizedAt } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true,
      effectiveFrom: true,
      effectiveTo: true,
      items: {
        orderBy: { bps: "desc" },
        select: {
          payeeId: true,
          bps: true,
          payee: { select: { id: true, name: true, login: true } },
        },
      },
    },
  });

  const items: RateioPlanItem[] =
    plan?.items?.length
      ? plan.items
      : [
          {
            payeeId: p.cedente.owner.id,
            bps: 10000,
            payee: { id: p.cedente.owner.id, name: p.cedente.owner.name, login: p.cedente.owner.login },
          },
        ];

  const amounts = splitByBps(profitLiquidoCents, items);
  const rateio = items.map((it, idx) => ({
    payeeId: it.payeeId,
    bps: it.bps,
    payee: it.payee,
    amountCents: amounts[idx] ?? 0,
  }));

  const sumBps = items.reduce((a, it) => a + safeInt(it.bps, 0), 0);
  const sumRateio = rateio.reduce((a, it) => a + safeInt(it.amountCents, 0), 0);

  return NextResponse.json({
    ok: true,
    purchase: p,
    sales,
    metrics: {
      soldPoints,
      pax,
      salesTotalCents,
      salesPointsValueCents,
      salesTaxesCents,
      purchaseTotalCents,
      profitBrutoCents,
      bonusCents,
      profitLiquidoCents,
      avgMilheiroCents,
      remainingPoints,
    },
    plan: {
      effectiveFrom: plan?.effectiveFrom?.toISOString?.() ?? null,
      effectiveTo: plan?.effectiveTo?.toISOString?.() ?? null,
      sumBps,
      isDefault: !plan,
    },
    rateio,
    checks: {
      sumRateioCents: sumRateio,
    },
  });
}
