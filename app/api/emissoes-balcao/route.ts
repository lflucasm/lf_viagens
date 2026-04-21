import { NextRequest, NextResponse } from "next/server";
import { BalcaoAirline } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { triggerEmployeePayoutAutoCompute } from "@/lib/payouts/autoCompute";
import {
  BALCAO_TAX_DEFAULT_PERCENT,
  BalcaoTaxRule,
  balcaoProfitSemTaxaCents,
  buildTaxRule,
  recifeDateISO,
  resolveTaxPercent,
  sellerCommissionCentsFromNet,
  taxFromProfitCents,
  netProfitAfterTaxCents,
} from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const AIRLINES: BalcaoAirline[] = [
  "LATAM",
  "SMILES",
  "AZUL",
  "TAP",
  "IBERIA",
  "FLYING_BLUE",
  "COPA_AIRLINES",
  "UNITED",
];

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: noCacheHeaders() });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

function parsePoints(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "");
  const n = Number(digits || "0");
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parseMoneyToCents(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isAirline(v: unknown): v is BalcaoAirline {
  return AIRLINES.includes(String(v) as BalcaoAirline);
}

function toRow(item: {
  id: string;
  airline: BalcaoAirline;
  points: number;
  buyRateCents: number;
  sellRateCents: number;
  boardingFeeCents: number;
  supplierPayCents: number;
  customerChargeCents: number;
  profitCents: number;
  locator: string | null;
  note: string | null;
  createdAt: Date;
  supplierCliente: { id: string; identificador: string; nome: string };
  finalCliente: { id: string; identificador: string; nome: string };
  employee: { id: string; name: string; login: string } | null;
}, rule: BalcaoTaxRule) {
  const normalizedProfitCents = balcaoProfitSemTaxaCents({
    customerChargeCents: item.customerChargeCents,
    supplierPayCents: item.supplierPayCents,
    boardingFeeCents: item.boardingFeeCents,
  });
  const dateISO = recifeDateISO(item.createdAt);
  const taxPercent = resolveTaxPercent(dateISO, rule);
  const taxCents = taxFromProfitCents(normalizedProfitCents, taxPercent);
  const netProfitCents = netProfitAfterTaxCents(normalizedProfitCents, taxCents);
  const sellerCommissionCents = sellerCommissionCentsFromNet(netProfitCents);

  return {
    id: item.id,
    airline: item.airline,
    points: item.points,
    buyRateCents: item.buyRateCents,
    sellRateCents: item.sellRateCents,
    boardingFeeCents: item.boardingFeeCents,
    supplierPayCents: item.supplierPayCents,
    customerChargeCents: item.customerChargeCents,
    profitCents: normalizedProfitCents,
    taxPercent,
    taxCents,
    netProfitCents,
    sellerCommissionCents,
    locator: item.locator,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    supplierCliente: item.supplierCliente,
    finalCliente: item.finalCliente,
    employee: item.employee,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = session?.team;
    if (!team) return bad("Sessão inválida.", 401);

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const taxRule = buildTaxRule(settings);

    const q = new URL(req.url).searchParams.get("q")?.trim() || "";

    const rows = await prisma.balcaoOperacao.findMany({
      where: q
        ? {
            team,
            OR: [
              { supplierCliente: { nome: { contains: q, mode: "insensitive" } } },
              { supplierCliente: { identificador: { contains: q, mode: "insensitive" } } },
              { finalCliente: { nome: { contains: q, mode: "insensitive" } } },
              { finalCliente: { identificador: { contains: q, mode: "insensitive" } } },
              { employee: { name: { contains: q, mode: "insensitive" } } },
              { employee: { login: { contains: q, mode: "insensitive" } } },
              { locator: { contains: q, mode: "insensitive" } },
              { note: { contains: q, mode: "insensitive" } },
            ],
          }
        : { team },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        airline: true,
        points: true,
        buyRateCents: true,
        sellRateCents: true,
        boardingFeeCents: true,
        supplierPayCents: true,
        customerChargeCents: true,
        profitCents: true,
        locator: true,
        note: true,
        createdAt: true,
        supplierCliente: { select: { id: true, identificador: true, nome: true } },
        finalCliente: { select: { id: true, identificador: true, nome: true } },
        employee: { select: { id: true, name: true, login: true } },
      },
    });

    const data = rows.map((row) => toRow(row, taxRule));

    const resumo = data.reduce(
      (acc, row) => {
        acc.totalSupplierPayCents += row.supplierPayCents;
        acc.totalCustomerChargeCents += row.customerChargeCents;
        acc.totalProfitCents += row.profitCents;
        acc.totalTaxCents += row.taxCents;
        acc.totalNetProfitCents += row.netProfitCents;
        acc.totalSellerCommissionCents += row.sellerCommissionCents;
        return acc;
      },
      {
        totalSupplierPayCents: 0,
        totalCustomerChargeCents: 0,
        totalProfitCents: 0,
        totalTaxCents: 0,
        totalNetProfitCents: 0,
        totalSellerCommissionCents: 0,
      }
    );

    return ok({
      rows: data,
      resumo,
      taxRule: {
        defaultPercent: BALCAO_TAX_DEFAULT_PERCENT,
        configuredPercent: taxRule.configuredPercent,
        effectiveISO: taxRule.effectiveISO,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao carregar emissões no balcão.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = session?.team;
    if (!team) return bad("Sessão inválida.", 401);

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const taxRule = buildTaxRule(settings);

    const body = await req.json().catch(() => ({}));

    const supplierClienteId = String(body?.supplierClienteId || "").trim();
    const finalClienteId = String(body?.finalClienteId || "").trim();
    const employeeIdRaw = String(body?.employeeId || "").trim();
    const airlineRaw = String(body?.airline || "").trim();

    const points = parsePoints(body?.points);
    const buyRateCents = parseMoneyToCents(body?.buyRate);
    const sellRateCents = parseMoneyToCents(body?.sellRate);
    const boardingFeeCents = parseMoneyToCents(body?.boardingFee);
    const locator = String(body?.locator || "")
      .trim()
      .toUpperCase() || null;
    const note = String(body?.note || "").trim() || null;

    if (!supplierClienteId) return bad("Selecione o fornecedor.");
    if (!finalClienteId) return bad("Selecione o cliente final.");
    if (supplierClienteId === finalClienteId) {
      return bad("Fornecedor e cliente final devem ser diferentes.");
    }

    if (!isAirline(airlineRaw)) {
      return bad("CIA aérea inválida.");
    }

    if (points <= 0) return bad("Informe a quantidade de pontos.");
    if (buyRateCents <= 0) return bad("Informe o milheiro de compra.");
    if (sellRateCents <= 0) return bad("Informe o milheiro de venda.");
    if (boardingFeeCents < 0) return bad("Taxa de embarque inválida.");
    if (locator && locator.length > 32) return bad("Localizador muito longo.");

    const [supplier, customer] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: supplierClienteId },
        select: { id: true },
      }),
      prisma.cliente.findUnique({
        where: { id: finalClienteId },
        select: { id: true },
      }),
    ]);

    if (!supplier) return bad("Fornecedor não encontrado.");
    if (!customer) return bad("Cliente final não encontrado.");

    const employeeId = employeeIdRaw || session.id;
    const employee = await prisma.user.findFirst({
      where: { id: employeeId, team },
      select: { id: true },
    });

    if (!employee) {
      return bad("Funcionário inválido para o time atual.");
    }

    const supplierPayCents = Math.round((points * buyRateCents) / 1000);
    const customerChargeCents = Math.round((points * sellRateCents) / 1000) + boardingFeeCents;
    const profitCents = customerChargeCents - supplierPayCents - boardingFeeCents;

    const created = await prisma.balcaoOperacao.create({
      data: {
        team,
        supplierClienteId,
        finalClienteId,
        employeeId: employee.id,
        airline: airlineRaw,
        points,
        buyRateCents,
        sellRateCents,
        boardingFeeCents,
        supplierPayCents,
        customerChargeCents,
        profitCents,
        locator,
        note,
      },
      select: {
        id: true,
        airline: true,
        points: true,
        buyRateCents: true,
        sellRateCents: true,
        boardingFeeCents: true,
        supplierPayCents: true,
        customerChargeCents: true,
        profitCents: true,
        locator: true,
        note: true,
        createdAt: true,
        supplierCliente: { select: { id: true, identificador: true, nome: true } },
        finalCliente: { select: { id: true, identificador: true, nome: true } },
        employee: { select: { id: true, name: true, login: true } },
      },
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoCompute(req, {
      team,
      fallbackBasis: "SALE_DATE",
    });

    return ok({ row: toRow(created, taxRule), payoutAutoCompute }, 201);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao cadastrar emissão no balcão.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}
