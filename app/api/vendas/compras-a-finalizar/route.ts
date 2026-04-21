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
  const store = await cookies(); // Next 16 (await ok mesmo se sync)
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

type OutSale = {
  id: string;
  numero: string;
  date: string;
  program: string;
  points: number;
  passengers: number;

  // ✅ total cobrado do cliente (pode incluir taxa)
  totalCents: number;

  // ✅ SOMENTE valor das milhas (SEM taxa) — usado para milheiro e lucro
  pointsValueCents: number;

  locator: string | null;
  paymentStatus: string;
};

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyWithSales = url.searchParams.get("onlyWithSales") === "1";

  const whereBase: any = {
    status: "CLOSED", // compra LIBERADA
    cedente: { owner: { team: session.team } },
  };

  if (q) {
    whereBase.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { numero: { contains: q, mode: "insensitive" } },
      { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
      { cedente: { identificador: { contains: q, mode: "insensitive" } } },
      { cedente: { cpf: { contains: q, mode: "insensitive" } } },
    ];
  }

  // ✅ fallback caso ainda não tenha as colunas finalized*
  let needsMigration = false;

  const selectPurchase = {
    id: true,
    numero: true,
    totalCents: true,
    createdAt: true,

    // ✅ projeções
    pontosCiaTotal: true,
    metaMilheiroCents: true,

    cedente: {
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        identificador: true,
      },
    },
  } as const;

  let purchases: Array<{
    id: string;
    numero: string;
    totalCents: number;
    pontosCiaTotal: number;
    metaMilheiroCents: number;
    createdAt: Date;
    cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  }> = [];

  try {
    purchases = await prisma.purchase.findMany({
      where: { ...whereBase, finalizedAt: null },
      orderBy: { createdAt: "desc" },
      select: selectPurchase,
    });
  } catch {
    needsMigration = true;
    purchases = await prisma.purchase.findMany({
      where: whereBase,
      orderBy: { createdAt: "desc" },
      select: selectPurchase,
    });
  }

  const ids = purchases.map((p) => p.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, rows: [], needsMigration });
  }

  /**
   * ✅ lista de vendas por compra (pra expandir)
   * IMPORTANTE:
   * - pointsValueCents (sem taxa)
   * - fallback: se pointsValueCents vier 0 nos dados antigos, assume = totalCents (taxas = 0)
   */
  const sales = await prisma.sale.findMany({
    where: {
      purchaseId: { in: ids },
      paymentStatus: { not: "CANCELED" },
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      numero: true,
      date: true,
      program: true,
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
      locator: true,
      paymentStatus: true,
      purchaseId: true,
    },
  });

  const byPurchase = new Map<string, OutSale[]>();
  for (const s of sales) {
    if (!s.purchaseId) continue;

    const totalCents = safeInt(s.totalCents, 0);
    let pvCents = safeInt((s as any).pointsValueCents, 0);

    // ✅ compatibilidade com backend antigo:
    // se não tem pointsValueCents, trata como "sem taxa" = total
    if (pvCents <= 0 && totalCents > 0) pvCents = totalCents;

    const list = byPurchase.get(s.purchaseId) || [];
    list.push({
      id: s.id,
      numero: s.numero,
      date: s.date.toISOString(),
      program: String(s.program),
      points: safeInt(s.points),
      passengers: safeInt(s.passengers),

      totalCents, // com taxa (se tiver)
      pointsValueCents: pvCents, // ✅ sem taxa (ou fallback)

      locator: s.locator ?? null,
      paymentStatus: String(s.paymentStatus),
    });
    byPurchase.set(s.purchaseId, list);
  }

  /**
   * ✅ agregados (pra cards/linha resumo)
   * - totalCents = caixa (com taxa)
   * - pointsValueCents = milhas (sem taxa)
   * - fallback: se sum(pointsValueCents)=0 e totalCents>0, assume "sem taxa" = total (taxas=0)
   */
  const sums = await prisma.sale.groupBy({
    by: ["purchaseId"],
    where: {
      purchaseId: { in: ids },
      paymentStatus: { not: "CANCELED" },
    },
    _sum: {
      points: true,
      passengers: true,
      totalCents: true,
      pointsValueCents: true,
    },
    _count: { _all: true },
    _max: { date: true },
  });

  const sumMap = new Map<
    string,
    {
      soldPoints: number;
      pax: number;

      salesTotalCents: number; // com taxa
      salesPointsValueCents: number; // sem taxa (ou fallback)
      salesTaxesCents: number; // diferença

      salesCount: number;
      lastSaleAt: string | null;
    }
  >();

  for (const g of sums) {
    const pid = String(g.purchaseId || "");
    const totalCents = safeInt(g._sum.totalCents, 0);
    let ptsCents = safeInt(g._sum.pointsValueCents, 0);

    // ✅ compatibilidade com backend antigo
    if (ptsCents <= 0 && totalCents > 0) ptsCents = totalCents;

    const taxes = Math.max(totalCents - ptsCents, 0);

    sumMap.set(pid, {
      soldPoints: safeInt(g._sum.points, 0),
      pax: safeInt(g._sum.passengers, 0),

      salesTotalCents: totalCents,
      salesPointsValueCents: ptsCents,
      salesTaxesCents: taxes,

      salesCount: safeInt(g._count._all, 0),
      lastSaleAt: g._max.date ? new Date(g._max.date as any).toISOString() : null,
    });
  }

  let rows = purchases.map((p) => {
    const agg = sumMap.get(p.id) || {
      soldPoints: 0,
      pax: 0,
      salesTotalCents: 0,
      salesPointsValueCents: 0,
      salesTaxesCents: 0,
      salesCount: 0,
      lastSaleAt: null,
    };

    const purchaseTotalCents = safeInt(p.totalCents, 0);
    const pointsTotal = safeInt(p.pontosCiaTotal, 0);
    const metaMilheiroCents = safeInt(p.metaMilheiroCents, 0);

    const soldPoints = safeInt(agg.soldPoints, 0);
    const remainingPoints = Math.max(pointsTotal - soldPoints, 0);

    const salesTotalCents = safeInt(agg.salesTotalCents, 0); // com taxa
    const salesPointsValueCents = safeInt(agg.salesPointsValueCents, 0); // sem taxa
    const salesTaxesCents = safeInt(agg.salesTaxesCents, 0);

    // ✅ milheiro médio baseado no "valor das milhas" (sem taxa)
    const avgMilheiroCents =
      soldPoints > 0 && salesPointsValueCents > 0
        ? Math.round((salesPointsValueCents * 1000) / soldPoints)
        : null;

    // ✅ projeções SEM taxa
    const projectedRevenueAvgCents =
      avgMilheiroCents == null
        ? null
        : salesPointsValueCents + Math.round((remainingPoints * avgMilheiroCents) / 1000);

    const projectedProfitAvgCents =
      projectedRevenueAvgCents == null ? null : projectedRevenueAvgCents - purchaseTotalCents;

    const projectedRevenueMetaCents =
      salesPointsValueCents + Math.round((remainingPoints * metaMilheiroCents) / 1000);

    const projectedProfitMetaCents = projectedRevenueMetaCents - purchaseTotalCents;

    return {
      purchaseId: p.id,
      numero: p.numero,
      cedente: p.cedente,

      purchaseTotalCents,

      // ✅ duas visões (pra UI)
      salesTotalCents, // com taxa (caixa)
      salesPointsValueCents, // sem taxa (lucro/milheiro)
      salesTaxesCents, // taxas

      // ✅ saldo = lucro (sem taxa)
      saldoCents: salesPointsValueCents - purchaseTotalCents,

      pax: safeInt(agg.pax, 0),
      soldPoints,
      pointsTotal,
      remainingPoints,

      avgMilheiroCents,
      metaMilheiroCents,

      projectedProfitAvgCents,
      projectedProfitMetaCents,

      salesCount: safeInt(agg.salesCount, 0),
      lastSaleAt: agg.lastSaleAt,

      sales: byPurchase.get(p.id) || [],
    };
  });

  if (onlyWithSales) rows = rows.filter((r) => r.salesCount > 0);

  return NextResponse.json({ ok: true, rows, needsMigration });
}
