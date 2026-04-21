import { prisma } from "@/lib/prisma";

type AffiliateLike = {
  id: string;
  team: string;
  commissionBps: number;
};

export type AffiliateSaleMetric = {
  id: string;
  numero: string;
  date: Date;
  program: string;
  clientName: string;
  clientIdentifier: string;
  points: number;
  passengers: number;
  totalCents: number;
  pointsValueCents: number;
  costCents: number;
  profitBrutoCents: number;
  bonusCents: number;
  profitCents: number;
  affiliateCommissionCents: number;
  paymentStatus: string;
  locator: string | null;
};

export type AffiliateMetrics = {
  clientsCount: number;
  salesCount: number;
  totalSalesCents: number;
  totalProfitCents: number;
  totalCommissionCents: number;
  commissionBps: number;
  sales: AffiliateSaleMetric[];
};

function safeInt(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function choosePointsValueCents(args: {
  pointsValueCents: number;
  totalCents: number;
  embarqueFeeCents: number;
}) {
  if (args.pointsValueCents > 0) return args.pointsValueCents;
  return Math.max(0, args.totalCents - args.embarqueFeeCents);
}

function costForSale(points: number, custoMilheiroCents: number) {
  const factor = safeInt(points) / 1000;
  if (factor <= 0 || custoMilheiroCents <= 0) return 0;
  return Math.round(factor * custoMilheiroCents);
}

export async function getAffiliateMetrics(
  affiliate: AffiliateLike,
  options: { includeSales?: boolean; saleLimit?: number } = {}
): Promise<AffiliateMetrics> {
  const includeSales = options.includeSales !== false;
  const saleLimit = Math.max(1, Math.min(1000, safeInt(options.saleLimit || 500)));

  const [clientsCount, sales] = await Promise.all([
    prisma.cliente.count({
      where: {
        affiliateId: affiliate.id,
        affiliate: { team: affiliate.team },
      },
    }),
    prisma.sale.findMany({
      where: {
        cliente: {
          affiliateId: affiliate.id,
          affiliate: { team: affiliate.team },
        },
        cedente: {
          owner: { team: affiliate.team },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        numero: true,
        date: true,
        program: true,
        points: true,
        passengers: true,
        embarqueFeeCents: true,
        pointsValueCents: true,
        totalCents: true,
        bonusCents: true,
        paymentStatus: true,
        locator: true,
        cliente: { select: { identificador: true, nome: true } },
        purchase: { select: { custoMilheiroCents: true } },
      },
    }),
  ]);

  let totalSalesCents = 0;
  let totalProfitCents = 0;
  let totalCommissionCents = 0;

  const rows = sales.map((sale) => {
    const totalCents = safeInt(sale.totalCents);
    const points = safeInt(sale.points);
    const pointsValueCents = choosePointsValueCents({
      pointsValueCents: safeInt(sale.pointsValueCents),
      totalCents,
      embarqueFeeCents: safeInt(sale.embarqueFeeCents),
    });
    const costCents = costForSale(points, safeInt(sale.purchase?.custoMilheiroCents));
    const bonusCents = safeInt(sale.bonusCents);
    const profitBrutoCents = pointsValueCents - costCents;
    const profitCents = profitBrutoCents - bonusCents;
    const affiliateCommissionCents = Math.round(
      Math.max(0, profitCents) * (safeInt(affiliate.commissionBps) / 10000)
    );

    totalSalesCents += totalCents;
    totalProfitCents += profitCents;
    totalCommissionCents += affiliateCommissionCents;

    return {
      id: sale.id,
      numero: sale.numero,
      date: sale.date,
      program: sale.program,
      clientName: sale.cliente?.nome || "-",
      clientIdentifier: sale.cliente?.identificador || "-",
      points,
      passengers: safeInt(sale.passengers),
      totalCents,
      pointsValueCents,
      costCents,
      profitBrutoCents,
      bonusCents,
      profitCents,
      affiliateCommissionCents,
      paymentStatus: sale.paymentStatus,
      locator: sale.locator,
    };
  });

  return {
    clientsCount,
    salesCount: rows.length,
    totalSalesCents,
    totalProfitCents,
    totalCommissionCents,
    commissionBps: safeInt(affiliate.commissionBps),
    sales: includeSales ? rows.slice(0, saleLimit) : [],
  };
}
