import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  balcaoProfitSemTaxaCents,
  buildTaxRule,
  netProfitAfterTaxCents,
  recifeDateISO,
  resolveTaxPercent,
  sellerCommissionCentsFromNet,
  taxFromProfitCents,
} from "@/lib/balcao-commission";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_WINDOWS = [30, 60, 90, 180, 360] as const;
const MONEY_FORMAT = '"R$"#,##0.00;[Red]-"R$"#,##0.00';
const INTEGER_FORMAT = '#,##0';

type UserLite = {
  id: string;
  name: string;
  login: string;
  role?: string;
};

type PeriodAgg = {
  salesCount: number;
  passengers: number;
  points: number;
  salesNoFeeCents: number;
  boardingFeeCents: number;
  salesWithFeeCents: number;
  latamCents: number;
  smilesCents: number;
  liveloCents: number;
  esferaCents: number;
  balcaoOps: number;
  balcaoPoints: number;
  balcaoSupplierPayCents: number;
  balcaoCustomerChargeCents: number;
  balcaoBoardingFeeCents: number;
  balcaoProfitCents: number;
  balcaoTaxCents: number;
  balcaoNetProfitCents: number;
  balcaoEmployeeCommissionCents: number;
  payoutGrossCents: number;
  payoutTaxCents: number;
  payoutFeeCents: number;
  payoutNetGeneratedCents: number;
  payoutPaidCents: number;
  payoutPendingCents: number;
  payoutPaidRecords: number;
  payoutPendingRecords: number;
  finalizedPurchasesCount: number;
  finalizedPurchaseProfitCents: number;
  finalizedPurchasePositiveProfitCents: number;
  lossCents: number;
};

type EmployeeAgg = {
  month: string;
  userId: string;
  name: string;
  login: string;
  role: string;
  salesCount: number;
  passengers: number;
  salesNoFeeCents: number;
  boardingFeeCents: number;
  payoutDays: number;
  payoutGrossCents: number;
  payoutTaxCents: number;
  payoutFeeCents: number;
  payoutNetGeneratedCents: number;
  payoutPaidCents: number;
  payoutPendingCents: number;
  balcaoOps: number;
  balcaoGrossCents: number;
  balcaoTaxCents: number;
  balcaoCommissionCents: number;
};

type ComputedPurchase = {
  id: string;
  numero: string;
  status: string;
  ciaAerea: string;
  finalizedAt: Date | null;
  finalizedBy: string;
  cedenteNome: string;
  cedenteIdentificador: string;
  pontosCiaTotal: number;
  totalCents: number;
  metaMilheiroCents: number;
  salesCount: number;
  soldPoints: number;
  passengers: number;
  salesTotalCents: number;
  salesPointsValueCents: number;
  salesTaxesCents: number;
  bonusCents: number;
  profitBrutoCents: number;
  profitLiquidoCents: number;
  avgMilheiroCents: number | null;
  remainingPoints: number | null;
  hasSales: boolean;
};

type LossRow = ComputedPurchase & {
  lossType: "Compra finalizada" | "Localizador derrubado";
};

type BalcaoComputed = {
  profitCents: number;
  taxCents: number;
  netProfitCents: number;
  sellerCommissionCents: number;
  taxPercent: number;
};

type TableColumn = {
  header: string;
  key: string;
  width?: number;
};

type TableRow = Record<string, string | number | Date | null | undefined>;

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function isoDateNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dayStartUTC(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}

function addDaysUTC(d: Date, delta: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}

function isoDayUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthStartUTC(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, 1, 0, 0, 0, 0));
}

function addMonthsUTC(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 0, 0, 0, 0));
}

function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabelPT(yyyyMm: string) {
  const dt = monthStartUTC(yyyyMm);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(dt)
    .replace(".", "");
}

function dateBR(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function dateTimeISO(d: Date | null | undefined) {
  return d ? d.toISOString().replace("T", " ").slice(0, 19) : "";
}

function pointsValueCents(points: number, milheiroCents: number) {
  const p = Math.max(0, safeInt(points, 0));
  const mk = Math.max(0, safeInt(milheiroCents, 0));
  if (!p || !mk) return 0;
  return Math.round((p / 1000) * mk);
}

function salePointsValueCents(s: { pointsValueCents?: number | null; points: number; milheiroCents: number }) {
  const db = safeInt(s.pointsValueCents, 0);
  return db > 0 ? db : pointsValueCents(safeInt(s.points, 0), safeInt(s.milheiroCents, 0));
}

function saleTotalCents(s: {
  totalCents?: number | null;
  pointsValueCents?: number | null;
  points: number;
  milheiroCents: number;
  embarqueFeeCents?: number | null;
}) {
  const db = safeInt(s.totalCents, 0);
  if (db > 0) return db;
  return salePointsValueCents(s) + Math.max(0, safeInt(s.embarqueFeeCents, 0));
}

function milheiroFrom(points: number, pointsValue: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValue, 0);
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

function saleTeamWhere(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { sellerId: null, cedente: { owner: { team } } },
    ],
  };
}

function emptyAgg(): PeriodAgg {
  return {
    salesCount: 0,
    passengers: 0,
    points: 0,
    salesNoFeeCents: 0,
    boardingFeeCents: 0,
    salesWithFeeCents: 0,
    latamCents: 0,
    smilesCents: 0,
    liveloCents: 0,
    esferaCents: 0,
    balcaoOps: 0,
    balcaoPoints: 0,
    balcaoSupplierPayCents: 0,
    balcaoCustomerChargeCents: 0,
    balcaoBoardingFeeCents: 0,
    balcaoProfitCents: 0,
    balcaoTaxCents: 0,
    balcaoNetProfitCents: 0,
    balcaoEmployeeCommissionCents: 0,
    payoutGrossCents: 0,
    payoutTaxCents: 0,
    payoutFeeCents: 0,
    payoutNetGeneratedCents: 0,
    payoutPaidCents: 0,
    payoutPendingCents: 0,
    payoutPaidRecords: 0,
    payoutPendingRecords: 0,
    finalizedPurchasesCount: 0,
    finalizedPurchaseProfitCents: 0,
    finalizedPurchasePositiveProfitCents: 0,
    lossCents: 0,
  };
}

function addAgg(target: PeriodAgg, source: PeriodAgg) {
  for (const key of Object.keys(target) as Array<keyof PeriodAgg>) {
    target[key] += source[key];
  }
  return target;
}

function totalSoldCents(a: PeriodAgg) {
  return a.salesWithFeeCents + a.balcaoCustomerChargeCents;
}

function getProgramField(program: string): keyof Pick<PeriodAgg, "latamCents" | "smilesCents" | "liveloCents" | "esferaCents"> | null {
  if (program === "LATAM") return "latamCents";
  if (program === "SMILES") return "smilesCents";
  if (program === "LIVELO") return "liveloCents";
  if (program === "ESFERA") return "esferaCents";
  return null;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, lastCol: number) {
  const row = ws.getRow(rowNumber);
  row.height = 22;
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF334155" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  }
}

function columnLetter(index: number) {
  let n = index;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function addTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: TableColumn[],
  rows: TableRow[],
  options?: { moneyKeys?: string[]; integerKeys?: string[]; percentKeys?: string[] }
) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 16 }));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  styleHeaderRow(ws, 1, columns.length);

  for (const row of rows) {
    ws.addRow(row);
  }

  const moneyIndexes = new Set((options?.moneyKeys || []).map((key) => columns.findIndex((c) => c.key === key) + 1).filter(Boolean));
  const integerIndexes = new Set((options?.integerKeys || []).map((key) => columns.findIndex((c) => c.key === key) + 1).filter(Boolean));
  const percentIndexes = new Set((options?.percentKeys || []).map((key) => columns.findIndex((c) => c.key === key) + 1).filter(Boolean));

  for (let r = 2; r <= ws.rowCount; r++) {
    for (const idx of moneyIndexes) {
      const cell = ws.getRow(r).getCell(idx);
      cell.numFmt = MONEY_FORMAT;
      cell.alignment = { horizontal: "right" };
    }
    for (const idx of integerIndexes) {
      const cell = ws.getRow(r).getCell(idx);
      cell.numFmt = INTEGER_FORMAT;
      cell.alignment = { horizontal: "right" };
    }
    for (const idx of percentIndexes) {
      const cell = ws.getRow(r).getCell(idx);
      cell.numFmt = '0.00%';
      cell.alignment = { horizontal: "right" };
    }
  }

  ws.autoFilter = {
    from: "A1",
    to: `${columnLetter(columns.length)}1`,
  };

  return ws;
}

function cents(centsValue: number) {
  return safeInt(centsValue, 0) / 100;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function monthRowsFromRange(firstMonth: string, lastMonth: string) {
  const rows: string[] = [];
  for (let d = monthStartUTC(firstMonth); monthKeyUTC(d) <= lastMonth; d = addMonthsUTC(d, 1)) {
    rows.push(monthKeyUTC(d));
  }
  return rows;
}

function aggToSummaryRow(label: string, start: string, end: string, days: number, agg: PeriodAgg): TableRow {
  const sold = totalSoldCents(agg);
  const profitAfterLoss = agg.finalizedPurchasePositiveProfitCents + agg.lossCents;
  return {
    periodo: label,
    dias: days,
    dataInicial: dateBR(start),
    dataFinal: dateBR(end),
    vendasMilhasSemTaxa: cents(agg.salesNoFeeCents),
    taxaEmbarque: cents(agg.boardingFeeCents),
    vendasMilhasComTaxa: cents(agg.salesWithFeeCents),
    balcaoVendido: cents(agg.balcaoCustomerChargeCents),
    totalVendido: cents(sold),
    qtdVendas: agg.salesCount,
    passageiros: agg.passengers,
    operacoesBalcao: agg.balcaoOps,
    lucroBalcaoLiquido: cents(agg.balcaoNetProfitCents),
    lucroComprasFinalizadas: cents(agg.finalizedPurchaseProfitCents),
    prejuizos: cents(agg.lossCents),
    lucroAposPrejuizos: cents(profitAfterLoss),
    comissoesGeradas: cents(agg.payoutNetGeneratedCents + agg.balcaoEmployeeCommissionCents),
    pagoRegistrado: cents(agg.payoutPaidCents),
    pendenteFuncionarios: cents(agg.payoutPendingCents),
  };
}

function makeBalcaoComputed(op: {
  createdAt: Date;
  customerChargeCents: number;
  supplierPayCents: number;
  boardingFeeCents: number;
}, taxRule: ReturnType<typeof buildTaxRule>): BalcaoComputed {
  const profitCents = balcaoProfitSemTaxaCents({
    customerChargeCents: safeInt(op.customerChargeCents, 0),
    supplierPayCents: safeInt(op.supplierPayCents, 0),
    boardingFeeCents: safeInt(op.boardingFeeCents, 0),
  });
  const taxPercent = resolveTaxPercent(recifeDateISO(op.createdAt), taxRule);
  const taxCents = taxFromProfitCents(profitCents, taxPercent);
  const netProfitCents = netProfitAfterTaxCents(profitCents, taxCents);
  return {
    profitCents,
    taxCents,
    netProfitCents,
    sellerCommissionCents: sellerCommissionCentsFromNet(netProfitCents),
    taxPercent,
  };
}

export async function GET() {
  try {
    const sess = await requireSession();
    const team = String((sess as { team?: unknown })?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "TIME_NOT_FOUND" }, { status: 400 });
    }

    const notCanceled: Prisma.SaleWhereInput = { paymentStatus: { not: "CANCELED" } };

    const [users, settings, sales, balcaoOps, payouts, purchasesBase, manualLossSales] = await Promise.all([
      prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.settings.upsert({
        where: { key: "default" },
        create: { key: "default" },
        update: {},
        select: { taxPercent: true, taxEffectiveFrom: true },
      }),
      prisma.sale.findMany({
        where: {
          ...saleTeamWhere(team),
          ...notCanceled,
        },
        select: {
          id: true,
          numero: true,
          date: true,
          program: true,
          points: true,
          passengers: true,
          milheiroCents: true,
          embarqueFeeCents: true,
          pointsValueCents: true,
          totalCents: true,
          commissionCents: true,
          bonusCents: true,
          metaMilheiroCents: true,
          feeCardLabel: true,
          locator: true,
          purchaseCode: true,
          paymentStatus: true,
          paidAt: true,
          purchaseId: true,
          sellerId: true,
          seller: { select: { id: true, name: true, login: true } },
          cliente: { select: { id: true, nome: true, identificador: true, cpfCnpj: true } },
          cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
          createdAt: true,
        },
        orderBy: [{ date: "asc" }, { numero: "asc" }],
      }),
      prisma.balcaoOperacao.findMany({
        where: { team },
        select: {
          id: true,
          airline: true,
          employeeId: true,
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
          employee: { select: { id: true, name: true, login: true } },
          supplierCliente: { select: { nome: true, identificador: true, cpfCnpj: true } },
          finalCliente: { select: { nome: true, identificador: true, cpfCnpj: true } },
        },
        orderBy: [{ createdAt: "asc" }],
      }),
      prisma.employeePayout.findMany({
        where: { team },
        include: {
          user: { select: { id: true, name: true, login: true, role: true } },
          paidBy: { select: { id: true, name: true, login: true } },
        },
        orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
      }),
      prisma.purchase.findMany({
        where: {
          status: "CLOSED",
          finalizedAt: { not: null },
          cedente: { owner: { team } },
        },
        select: {
          id: true,
          numero: true,
          status: true,
          ciaAerea: true,
          pontosCiaTotal: true,
          metaMilheiroCents: true,
          totalCents: true,
          finalizedAt: true,
          finalizedBy: { select: { id: true, name: true, login: true } },
          cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ finalizedAt: "asc" }, { numero: "asc" }],
      }),
      prisma.sale.findMany({
        where: {
          program: "SMILES",
          smilesLocatorManualStatus: "DERRUBADO",
          smilesLocatorManualCheckedAt: { not: null },
          smilesLocatorLossCents: { gt: 0 },
          cedente: { owner: { team } },
        },
        select: {
          id: true,
          locator: true,
          smilesLocatorManualCheckedAt: true,
          smilesLocatorLossCents: true,
          createdAt: true,
          updatedAt: true,
          cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
        },
        orderBy: [{ smilesLocatorManualCheckedAt: "asc" }, { updatedAt: "asc" }],
      }),
    ]);

    const usersById = new Map<string, UserLite>(
      users.map((u) => [u.id, { id: u.id, name: u.name, login: u.login, role: u.role }] as const)
    );
    const taxRule = buildTaxRule(settings);

    const dayAgg = new Map<string, PeriodAgg>();
    const monthAgg = new Map<string, PeriodAgg>();
    const employeeAgg = new Map<string, EmployeeAgg>();

    function ensureDay(key: string) {
      const cur = dayAgg.get(key) || emptyAgg();
      dayAgg.set(key, cur);
      return cur;
    }

    function ensureMonth(key: string) {
      const cur = monthAgg.get(key) || emptyAgg();
      monthAgg.set(key, cur);
      return cur;
    }

    function addToPeriods(dayKey: string, apply: (agg: PeriodAgg) => void) {
      apply(ensureDay(dayKey));
      apply(ensureMonth(dayKey.slice(0, 7)));
    }

    function getUser(userId: string | null | undefined, fallback?: Partial<UserLite>): UserLite {
      if (userId && usersById.has(userId)) return usersById.get(userId)!;
      return {
        id: userId || "__NO_USER__",
        name: fallback?.name || "Sem funcionário",
        login: fallback?.login || "-",
        role: fallback?.role || "-",
      };
    }

    function ensureEmployee(month: string, userId: string | null | undefined, fallback?: Partial<UserLite>) {
      const user = getUser(userId, fallback);
      const key = `${month}|${user.id}`;
      const cur =
        employeeAgg.get(key) ||
        ({
          month,
          userId: user.id,
          name: user.name,
          login: user.login,
          role: user.role || "-",
          salesCount: 0,
          passengers: 0,
          salesNoFeeCents: 0,
          boardingFeeCents: 0,
          payoutDays: 0,
          payoutGrossCents: 0,
          payoutTaxCents: 0,
          payoutFeeCents: 0,
          payoutNetGeneratedCents: 0,
          payoutPaidCents: 0,
          payoutPendingCents: 0,
          balcaoOps: 0,
          balcaoGrossCents: 0,
          balcaoTaxCents: 0,
          balcaoCommissionCents: 0,
        } as EmployeeAgg);
      employeeAgg.set(key, cur);
      return cur;
    }

    for (const s of sales) {
      const dayKey = isoDayUTC(new Date(s.date));
      const pv = salePointsValueCents(s);
      const fee = Math.max(0, safeInt(s.embarqueFeeCents, 0));
      const total = saleTotalCents(s);
      const points = Math.max(0, safeInt(s.points, 0));
      const passengers = Math.max(0, safeInt(s.passengers, 0));
      const programField = getProgramField(String(s.program || ""));

      addToPeriods(dayKey, (agg) => {
        agg.salesCount += 1;
        agg.passengers += passengers;
        agg.points += points;
        agg.salesNoFeeCents += pv;
        agg.boardingFeeCents += fee;
        agg.salesWithFeeCents += total;
        if (programField) agg[programField] += pv;
      });

      const employee = ensureEmployee(dayKey.slice(0, 7), s.sellerId || "__NO_SELLER__", {
        name: s.seller?.name || "Sem vendedor",
        login: s.seller?.login || "-",
      });
      employee.salesCount += 1;
      employee.passengers += passengers;
      employee.salesNoFeeCents += pv;
      employee.boardingFeeCents += fee;
    }

    const balcaoComputedById = new Map<string, BalcaoComputed>();
    for (const op of balcaoOps) {
      const dayKey = recifeDateISO(op.createdAt);
      const computed = makeBalcaoComputed(
        {
          createdAt: op.createdAt,
          customerChargeCents: op.customerChargeCents,
          supplierPayCents: op.supplierPayCents,
          boardingFeeCents: op.boardingFeeCents,
        },
        taxRule
      );
      balcaoComputedById.set(op.id, computed);

      addToPeriods(dayKey, (agg) => {
        agg.balcaoOps += 1;
        agg.balcaoPoints += Math.max(0, safeInt(op.points, 0));
        agg.balcaoSupplierPayCents += Math.max(0, safeInt(op.supplierPayCents, 0));
        agg.balcaoCustomerChargeCents += Math.max(0, safeInt(op.customerChargeCents, 0));
        agg.balcaoBoardingFeeCents += Math.max(0, safeInt(op.boardingFeeCents, 0));
        agg.balcaoProfitCents += computed.profitCents;
        agg.balcaoTaxCents += computed.taxCents;
        agg.balcaoNetProfitCents += computed.netProfitCents;
        agg.balcaoEmployeeCommissionCents += computed.sellerCommissionCents;
      });

      const employee = ensureEmployee(dayKey.slice(0, 7), op.employeeId || "__NO_BALCAO_EMPLOYEE__", {
        name: op.employee?.name || "Sem funcionário",
        login: op.employee?.login || "-",
      });
      employee.balcaoOps += 1;
      employee.balcaoGrossCents += computed.profitCents;
      employee.balcaoTaxCents += computed.taxCents;
      employee.balcaoCommissionCents += computed.sellerCommissionCents;
    }

    for (const p of payouts) {
      const dayKey = String(p.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
      const gross = safeInt(p.grossProfitCents, 0);
      const tax = safeInt(p.tax7Cents, 0);
      const fee = safeInt(p.feeCents, 0);
      const net = safeInt(p.netPayCents, 0);
      const isPaid = Boolean(p.paidAt || p.paidById);

      addToPeriods(dayKey, (agg) => {
        agg.payoutGrossCents += gross;
        agg.payoutTaxCents += tax;
        agg.payoutFeeCents += fee;
        agg.payoutNetGeneratedCents += net;
        if (isPaid) {
          agg.payoutPaidCents += net;
          agg.payoutPaidRecords += 1;
        } else {
          agg.payoutPendingCents += net;
          agg.payoutPendingRecords += 1;
        }
      });

      const employee = ensureEmployee(dayKey.slice(0, 7), p.userId, p.user);
      employee.payoutDays += 1;
      employee.payoutGrossCents += gross;
      employee.payoutTaxCents += tax;
      employee.payoutFeeCents += fee;
      employee.payoutNetGeneratedCents += net;
      if (isPaid) employee.payoutPaidCents += net;
      else employee.payoutPendingCents += net;
    }

    const purchaseById = new Map(purchasesBase.map((p) => [p.id, p] as const));
    const idByNumeroUpper = new Map<string, string>(
      purchasesBase
        .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
        .filter(([k]) => !!k)
    );

    function normalizePurchaseId(raw: string) {
      const r = String(raw || "").trim();
      if (!r) return "";
      return purchaseById.has(r) ? r : idByNumeroUpper.get(r.toUpperCase()) || r;
    }

    const purchaseSalesAgg = new Map<
      string,
      {
        soldPoints: number;
        passengers: number;
        salesTotalCents: number;
        salesPointsValueCents: number;
        salesTaxesCents: number;
        bonusCents: number;
        salesCount: number;
      }
    >();

    for (const s of sales) {
      const pid = normalizePurchaseId(String(s.purchaseId || ""));
      if (!purchaseById.has(pid)) continue;

      const pv = salePointsValueCents(s);
      const total = saleTotalCents(s);
      const taxes = Math.max(total - pv, 0);
      const cur =
        purchaseSalesAgg.get(pid) || {
          soldPoints: 0,
          passengers: 0,
          salesTotalCents: 0,
          salesPointsValueCents: 0,
          salesTaxesCents: 0,
          bonusCents: 0,
          salesCount: 0,
        };

      const points = safeInt(s.points, 0);
      cur.soldPoints += points;
      cur.passengers += safeInt(s.passengers, 0);
      cur.salesTotalCents += total;
      cur.salesPointsValueCents += pv;
      cur.salesTaxesCents += taxes;
      cur.salesCount += 1;

      const p = purchaseById.get(pid);
      if (p) {
        cur.bonusCents += bonus30(points, milheiroFrom(points, pv), safeInt(p.metaMilheiroCents, 0));
      }

      purchaseSalesAgg.set(pid, cur);
    }

    const computedPurchases: ComputedPurchase[] = purchasesBase.map((p) => {
      const a =
        purchaseSalesAgg.get(p.id) || {
          soldPoints: 0,
          passengers: 0,
          salesTotalCents: 0,
          salesPointsValueCents: 0,
          salesTaxesCents: 0,
          bonusCents: 0,
          salesCount: 0,
        };
      const cost = safeInt(p.totalCents, 0);
      const profitBruto = a.salesPointsValueCents - cost;
      const profitLiquido = profitBruto - a.bonusCents;
      const hasSales =
        a.salesCount > 0 || a.salesPointsValueCents > 0 || a.salesTotalCents > 0 || a.soldPoints > 0;
      return {
        id: p.id,
        numero: String(p.numero || ""),
        status: String(p.status || ""),
        ciaAerea: String(p.ciaAerea || ""),
        finalizedAt: p.finalizedAt,
        finalizedBy: p.finalizedBy?.name || p.finalizedBy?.login || "",
        cedenteNome: p.cedente?.nomeCompleto || "",
        cedenteIdentificador: p.cedente?.identificador || "",
        pontosCiaTotal: safeInt(p.pontosCiaTotal, 0),
        totalCents: cost,
        metaMilheiroCents: safeInt(p.metaMilheiroCents, 0),
        salesCount: a.salesCount,
        soldPoints: a.soldPoints,
        passengers: a.passengers,
        salesTotalCents: a.salesTotalCents,
        salesPointsValueCents: a.salesPointsValueCents,
        salesTaxesCents: a.salesTaxesCents,
        bonusCents: a.bonusCents,
        profitBrutoCents: profitBruto,
        profitLiquidoCents: profitLiquido,
        avgMilheiroCents: a.soldPoints > 0 ? milheiroFrom(a.soldPoints, a.salesPointsValueCents) : null,
        remainingPoints: safeInt(p.pontosCiaTotal, 0) > 0 ? Math.max(safeInt(p.pontosCiaTotal, 0) - a.soldPoints, 0) : null,
        hasSales,
      };
    });

    const lossRows: LossRow[] = [];
    for (const p of computedPurchases) {
      if (!p.hasSales || p.profitLiquidoCents >= 0 || !p.finalizedAt) continue;
      lossRows.push({ ...p, lossType: "Compra finalizada" });

      const dayKey = isoDayUTC(p.finalizedAt);
      addToPeriods(dayKey, (agg) => {
        agg.lossCents += p.profitLiquidoCents;
      });
    }

    for (const p of computedPurchases) {
      if (!p.hasSales || !p.finalizedAt) continue;
      const dayKey = isoDayUTC(p.finalizedAt);
      addToPeriods(dayKey, (agg) => {
        agg.finalizedPurchasesCount += 1;
        agg.finalizedPurchaseProfitCents += p.profitLiquidoCents;
        if (p.profitLiquidoCents > 0) agg.finalizedPurchasePositiveProfitCents += p.profitLiquidoCents;
      });
    }

    for (const s of manualLossSales) {
      const checkedAt = s.smilesLocatorManualCheckedAt ? new Date(s.smilesLocatorManualCheckedAt) : null;
      const loss = -Math.max(0, safeInt(s.smilesLocatorLossCents, 0));
      if (!checkedAt || loss >= 0) continue;

      lossRows.push({
        id: `smiles-loss-${s.id}`,
        numero: s.locator ? `DERRUBADO ${s.locator}` : `DERRUBADO ${String(s.id).slice(0, 8)}`,
        status: "CLOSED",
        ciaAerea: "SMILES",
        finalizedAt: checkedAt,
        finalizedBy: "",
        cedenteNome: s.cedente?.nomeCompleto || "",
        cedenteIdentificador: s.cedente?.identificador || "",
        pontosCiaTotal: 0,
        totalCents: 0,
        metaMilheiroCents: 0,
        salesCount: 0,
        soldPoints: 0,
        passengers: 0,
        salesTotalCents: 0,
        salesPointsValueCents: 0,
        salesTaxesCents: 0,
        bonusCents: 0,
        profitBrutoCents: loss,
        profitLiquidoCents: loss,
        avgMilheiroCents: null,
        remainingPoints: null,
        hasSales: true,
        lossType: "Localizador derrubado",
      });

      const dayKey = isoDayUTC(checkedAt);
      addToPeriods(dayKey, (agg) => {
        agg.lossCents += loss;
      });
    }

    const todayISO = isoDateNowSP();
    const todayStart = dayStartUTC(todayISO);
    const allDayKeys = Array.from(dayAgg.keys()).sort();
    const firstDataDay = allDayKeys[0] || todayISO;
    const lastDataDay = allDayKeys[allDayKeys.length - 1] || todayISO;
    const lastDayDate =
      dayStartUTC(lastDataDay).getTime() > todayStart.getTime() ? dayStartUTC(lastDataDay) : todayStart;
    const lastDayISO = isoDayUTC(lastDayDate);

    const firstMonth = (Array.from(monthAgg.keys()).sort()[0] || todayISO.slice(0, 7));
    const lastMonth = monthKeyUTC(lastDayDate);
    for (const m of monthRowsFromRange(firstMonth, lastMonth)) ensureMonth(m);

    function dailyKeys(startISO: string, endISO: string) {
      const keys: string[] = [];
      for (let d = dayStartUTC(startISO); d <= dayStartUTC(endISO); d = addDaysUTC(d, 1)) {
        keys.push(isoDayUTC(d));
      }
      return keys;
    }

    function dailyTableRows(keys: string[]) {
      return keys.map((key) => {
        const a = dayAgg.get(key) || emptyAgg();
        return {
          data: dateBR(key),
          dataISO: key,
          vendasMilhasSemTaxa: cents(a.salesNoFeeCents),
          taxaEmbarque: cents(a.boardingFeeCents),
          vendasMilhasComTaxa: cents(a.salesWithFeeCents),
          balcaoVendido: cents(a.balcaoCustomerChargeCents),
          totalVendido: cents(totalSoldCents(a)),
          qtdVendas: a.salesCount,
          passageiros: a.passengers,
          operacoesBalcao: a.balcaoOps,
          lucroBalcaoLiquido: cents(a.balcaoNetProfitCents),
          lucroComprasFinalizadas: cents(a.finalizedPurchaseProfitCents),
          prejuizos: cents(a.lossCents),
          comissoesGeradas: cents(a.payoutNetGeneratedCents + a.balcaoEmployeeCommissionCents),
          pagoRegistrado: cents(a.payoutPaidCents),
          pendenteFuncionarios: cents(a.payoutPendingCents),
        };
      });
    }

    function summarizeKeys(keys: string[]) {
      return keys.reduce((acc, key) => addAgg(acc, dayAgg.get(key) || emptyAgg()), emptyAgg());
    }

    const totalDailyKeys = dailyKeys(firstDataDay, lastDayISO);
    const totalAgg = summarizeKeys(totalDailyKeys);

    const wb = new ExcelJS.Workbook();
    wb.creator = "TradeMiles";
    wb.created = new Date();
    wb.modified = new Date();
    wb.subject = "Analise completa da empresa";
    wb.title = "TradeMiles - Analise de dados";

    addTableSheet(
      wb,
      "Resumo IA",
      [
        { header: "Metrica", key: "metric", width: 42 },
        { header: "Valor", key: "value", width: 24 },
        { header: "Unidade", key: "unit", width: 18 },
        { header: "Observacao", key: "note", width: 70 },
      ],
      [
        { metric: "Gerado em", value: dateTimeISO(new Date()), unit: "", note: "Arquivo gerado pelo TradeMiles." },
        { metric: "Time", value: team, unit: "", note: "Dados filtrados pelo time do usuario logado." },
        { metric: "Primeiro dia com dados", value: dateBR(firstDataDay), unit: "data", note: "" },
        { metric: "Ultimo dia exportado", value: dateBR(lastDayISO), unit: "data", note: "" },
        { metric: "Vendas de milhas sem taxa", value: cents(totalAgg.salesNoFeeCents), unit: "BRL", note: "Valor dos pontos/milhas vendidos, sem taxa de embarque." },
        { metric: "Taxa de embarque", value: cents(totalAgg.boardingFeeCents), unit: "BRL", note: "Taxas registradas nas vendas de milhas." },
        { metric: "Vendas de milhas com taxa", value: cents(totalAgg.salesWithFeeCents), unit: "BRL", note: "Valor total das vendas de milhas, incluindo taxa de embarque." },
        { metric: "Vendas no balcao", value: cents(totalAgg.balcaoCustomerChargeCents), unit: "BRL", note: "Valor cobrado dos clientes nas operacoes de balcao." },
        { metric: "Total vendido", value: cents(totalSoldCents(totalAgg)), unit: "BRL", note: "Milhas com taxa + balcao." },
        { metric: "Quantidade de vendas de milhas", value: totalAgg.salesCount, unit: "vendas", note: "" },
        { metric: "Passageiros", value: totalAgg.passengers, unit: "pax", note: "" },
        { metric: "Operacoes de balcao", value: totalAgg.balcaoOps, unit: "operacoes", note: "" },
        { metric: "Lucro liquido do balcao", value: cents(totalAgg.balcaoNetProfitCents), unit: "BRL", note: "Valor vendido - fornecedor - taxa de embarque - imposto do balcao." },
        { metric: "Lucro de compras finalizadas", value: cents(totalAgg.finalizedPurchaseProfitCents), unit: "BRL", note: "Soma do lucro liquido calculado nas compras finalizadas com vendas vinculadas." },
        { metric: "Prejuizos", value: cents(totalAgg.lossCents), unit: "BRL", note: "Compras com lucro negativo + localizadores Smiles derrubados." },
        { metric: "Comissoes de funcionarios geradas", value: cents(totalAgg.payoutNetGeneratedCents + totalAgg.balcaoEmployeeCommissionCents), unit: "BRL", note: "Pagamentos de funcionarios registrados + comissao estimada do balcao." },
        { metric: "Pago registrado a funcionarios", value: cents(totalAgg.payoutPaidCents), unit: "BRL", note: "Somente registros EmployeePayout marcados como pagos." },
        { metric: "Pendente para funcionarios", value: cents(totalAgg.payoutPendingCents), unit: "BRL", note: "Registros EmployeePayout ainda sem pagamento." },
      ],
      undefined
    );

    const summaryRows = DAILY_WINDOWS.map((days) => {
      const start = isoDayUTC(addDaysUTC(lastDayDate, -(days - 1)));
      const keys = dailyKeys(start, lastDayISO);
      return aggToSummaryRow(`${days} dias`, start, lastDayISO, keys.length, summarizeKeys(keys));
    });
    summaryRows.push(aggToSummaryRow("Total", firstDataDay, lastDayISO, totalDailyKeys.length, totalAgg));

    const summaryMoneyKeys = [
      "vendasMilhasSemTaxa",
      "taxaEmbarque",
      "vendasMilhasComTaxa",
      "balcaoVendido",
      "totalVendido",
      "lucroBalcaoLiquido",
      "lucroComprasFinalizadas",
      "prejuizos",
      "lucroAposPrejuizos",
      "comissoesGeradas",
      "pagoRegistrado",
      "pendenteFuncionarios",
    ];
    const summaryIntegerKeys = ["dias", "qtdVendas", "passageiros", "operacoesBalcao"];

    addTableSheet(
      wb,
      "Resumo periodos",
      [
        { header: "Periodo", key: "periodo", width: 16 },
        { header: "Dias", key: "dias", width: 10 },
        { header: "Data inicial", key: "dataInicial", width: 16 },
        { header: "Data final", key: "dataFinal", width: 16 },
        { header: "Vendas milhas sem taxa", key: "vendasMilhasSemTaxa", width: 22 },
        { header: "Taxa embarque", key: "taxaEmbarque", width: 18 },
        { header: "Vendas milhas com taxa", key: "vendasMilhasComTaxa", width: 22 },
        { header: "Balcao vendido", key: "balcaoVendido", width: 18 },
        { header: "Total vendido", key: "totalVendido", width: 18 },
        { header: "Qtd vendas", key: "qtdVendas", width: 14 },
        { header: "PAX", key: "passageiros", width: 12 },
        { header: "Ops balcao", key: "operacoesBalcao", width: 14 },
        { header: "Lucro balcao liquido", key: "lucroBalcaoLiquido", width: 20 },
        { header: "Lucro compras finalizadas", key: "lucroComprasFinalizadas", width: 24 },
        { header: "Prejuizos", key: "prejuizos", width: 18 },
        { header: "Lucro apos prejuizos", key: "lucroAposPrejuizos", width: 22 },
        { header: "Comissoes geradas", key: "comissoesGeradas", width: 20 },
        { header: "Pago registrado", key: "pagoRegistrado", width: 18 },
        { header: "Pendente funcionarios", key: "pendenteFuncionarios", width: 22 },
      ],
      summaryRows,
      { moneyKeys: summaryMoneyKeys, integerKeys: summaryIntegerKeys }
    );

    const monthRows = monthRowsFromRange(firstMonth, lastMonth).map((month) => {
      const a = monthAgg.get(month) || emptyAgg();
      const sold = totalSoldCents(a);
      return {
        mes: month,
        mesNome: monthLabelPT(month),
        vendasMilhasSemTaxa: cents(a.salesNoFeeCents),
        taxaEmbarque: cents(a.boardingFeeCents),
        vendasMilhasComTaxa: cents(a.salesWithFeeCents),
        vendasLatam: cents(a.latamCents),
        vendasSmiles: cents(a.smilesCents),
        vendasLivelo: cents(a.liveloCents),
        vendasEsfera: cents(a.esferaCents),
        balcaoVendido: cents(a.balcaoCustomerChargeCents),
        totalVendido: cents(sold),
        qtdVendas: a.salesCount,
        passageiros: a.passengers,
        operacoesBalcao: a.balcaoOps,
        lucroBalcaoLiquido: cents(a.balcaoNetProfitCents),
        lucroComprasFinalizadas: cents(a.finalizedPurchaseProfitCents),
        lucroPositivoCompras: cents(a.finalizedPurchasePositiveProfitCents),
        prejuizos: cents(a.lossCents),
        comissoesGeradas: cents(a.payoutNetGeneratedCents + a.balcaoEmployeeCommissionCents),
        pagoRegistrado: cents(a.payoutPaidCents),
        pendenteFuncionarios: cents(a.payoutPendingCents),
      };
    });

    addTableSheet(
      wb,
      "Resumo mensal",
      [
        { header: "Mes", key: "mes", width: 12 },
        { header: "Mes nome", key: "mesNome", width: 20 },
        { header: "Vendas milhas sem taxa", key: "vendasMilhasSemTaxa", width: 22 },
        { header: "Taxa embarque", key: "taxaEmbarque", width: 18 },
        { header: "Vendas milhas com taxa", key: "vendasMilhasComTaxa", width: 22 },
        { header: "LATAM", key: "vendasLatam", width: 16 },
        { header: "SMILES", key: "vendasSmiles", width: 16 },
        { header: "LIVELO", key: "vendasLivelo", width: 16 },
        { header: "ESFERA", key: "vendasEsfera", width: 16 },
        { header: "Balcao vendido", key: "balcaoVendido", width: 18 },
        { header: "Total vendido", key: "totalVendido", width: 18 },
        { header: "Qtd vendas", key: "qtdVendas", width: 14 },
        { header: "PAX", key: "passageiros", width: 12 },
        { header: "Ops balcao", key: "operacoesBalcao", width: 14 },
        { header: "Lucro balcao liquido", key: "lucroBalcaoLiquido", width: 20 },
        { header: "Lucro compras finalizadas", key: "lucroComprasFinalizadas", width: 24 },
        { header: "Lucro positivo compras", key: "lucroPositivoCompras", width: 22 },
        { header: "Prejuizos", key: "prejuizos", width: 18 },
        { header: "Comissoes geradas", key: "comissoesGeradas", width: 20 },
        { header: "Pago registrado", key: "pagoRegistrado", width: 18 },
        { header: "Pendente funcionarios", key: "pendenteFuncionarios", width: 22 },
      ],
      monthRows,
      {
        moneyKeys: [
          "vendasMilhasSemTaxa",
          "taxaEmbarque",
          "vendasMilhasComTaxa",
          "vendasLatam",
          "vendasSmiles",
          "vendasLivelo",
          "vendasEsfera",
          "balcaoVendido",
          "totalVendido",
          "lucroBalcaoLiquido",
          "lucroComprasFinalizadas",
          "lucroPositivoCompras",
          "prejuizos",
          "comissoesGeradas",
          "pagoRegistrado",
          "pendenteFuncionarios",
        ],
        integerKeys: ["qtdVendas", "passageiros", "operacoesBalcao"],
      }
    );

    const dailyColumns: TableColumn[] = [
      { header: "Data", key: "data", width: 14 },
      { header: "Data ISO", key: "dataISO", width: 14 },
      { header: "Vendas milhas sem taxa", key: "vendasMilhasSemTaxa", width: 22 },
      { header: "Taxa embarque", key: "taxaEmbarque", width: 18 },
      { header: "Vendas milhas com taxa", key: "vendasMilhasComTaxa", width: 22 },
      { header: "Balcao vendido", key: "balcaoVendido", width: 18 },
      { header: "Total vendido", key: "totalVendido", width: 18 },
      { header: "Qtd vendas", key: "qtdVendas", width: 14 },
      { header: "PAX", key: "passageiros", width: 12 },
      { header: "Ops balcao", key: "operacoesBalcao", width: 14 },
      { header: "Lucro balcao liquido", key: "lucroBalcaoLiquido", width: 20 },
      { header: "Lucro compras finalizadas", key: "lucroComprasFinalizadas", width: 24 },
      { header: "Prejuizos", key: "prejuizos", width: 18 },
      { header: "Comissoes geradas", key: "comissoesGeradas", width: 20 },
      { header: "Pago registrado", key: "pagoRegistrado", width: 18 },
      { header: "Pendente funcionarios", key: "pendenteFuncionarios", width: 22 },
    ];

    for (const days of DAILY_WINDOWS) {
      const start = isoDayUTC(addDaysUTC(lastDayDate, -(days - 1)));
      addTableSheet(
        wb,
        `Diario ${days}d`,
        dailyColumns,
        dailyTableRows(dailyKeys(start, lastDayISO)),
        { moneyKeys: summaryMoneyKeys, integerKeys: ["qtdVendas", "passageiros", "operacoesBalcao"] }
      );
    }

    addTableSheet(
      wb,
      "Diario total",
      dailyColumns,
      dailyTableRows(totalDailyKeys),
      { moneyKeys: summaryMoneyKeys, integerKeys: ["qtdVendas", "passageiros", "operacoesBalcao"] }
    );

    const employeeRows = Array.from(employeeAgg.values())
      .filter(
        (r) =>
          r.salesCount ||
          r.payoutDays ||
          r.balcaoOps ||
          r.salesNoFeeCents ||
          r.payoutNetGeneratedCents ||
          r.balcaoCommissionCents
      )
      .sort((a, b) => (a.month === b.month ? a.name.localeCompare(b.name) : a.month.localeCompare(b.month)))
      .map((r) => ({
        mes: r.month,
        funcionario: r.name,
        login: r.login,
        role: r.role,
        vendas: r.salesCount,
        passageiros: r.passengers,
        vendasSemTaxa: cents(r.salesNoFeeCents),
        taxaEmbarqueVendas: cents(r.boardingFeeCents),
        diasComPagamento: r.payoutDays,
        comissaoBruta: cents(r.payoutGrossCents),
        impostoComissao: cents(r.payoutTaxCents),
        taxaReembolsada: cents(r.payoutFeeCents),
        liquidoGerado: cents(r.payoutNetGeneratedCents),
        liquidoPagoRegistrado: cents(r.payoutPaidCents),
        liquidoPendente: cents(r.payoutPendingCents),
        operacoesBalcao: r.balcaoOps,
        lucroBalcaoBase: cents(r.balcaoGrossCents),
        impostoBalcao: cents(r.balcaoTaxCents),
        comissaoBalcao: cents(r.balcaoCommissionCents),
        totalGeradoFuncionario: cents(r.payoutNetGeneratedCents + r.balcaoCommissionCents),
      }));

    addTableSheet(
      wb,
      "Funcionarios mes",
      [
        { header: "Mes", key: "mes", width: 12 },
        { header: "Funcionario", key: "funcionario", width: 30 },
        { header: "Login", key: "login", width: 18 },
        { header: "Role", key: "role", width: 12 },
        { header: "Vendas", key: "vendas", width: 12 },
        { header: "PAX", key: "passageiros", width: 12 },
        { header: "Vendas sem taxa", key: "vendasSemTaxa", width: 18 },
        { header: "Taxa embarque vendas", key: "taxaEmbarqueVendas", width: 22 },
        { header: "Dias com pagamento", key: "diasComPagamento", width: 18 },
        { header: "Comissao bruta", key: "comissaoBruta", width: 18 },
        { header: "Imposto comissao", key: "impostoComissao", width: 18 },
        { header: "Taxa reembolsada", key: "taxaReembolsada", width: 18 },
        { header: "Liquido gerado", key: "liquidoGerado", width: 18 },
        { header: "Liquido pago registrado", key: "liquidoPagoRegistrado", width: 22 },
        { header: "Liquido pendente", key: "liquidoPendente", width: 18 },
        { header: "Ops balcao", key: "operacoesBalcao", width: 14 },
        { header: "Lucro balcao base", key: "lucroBalcaoBase", width: 18 },
        { header: "Imposto balcao", key: "impostoBalcao", width: 18 },
        { header: "Comissao balcao", key: "comissaoBalcao", width: 18 },
        { header: "Total gerado funcionario", key: "totalGeradoFuncionario", width: 24 },
      ],
      employeeRows,
      {
        moneyKeys: [
          "vendasSemTaxa",
          "taxaEmbarqueVendas",
          "comissaoBruta",
          "impostoComissao",
          "taxaReembolsada",
          "liquidoGerado",
          "liquidoPagoRegistrado",
          "liquidoPendente",
          "lucroBalcaoBase",
          "impostoBalcao",
          "comissaoBalcao",
          "totalGeradoFuncionario",
        ],
        integerKeys: ["vendas", "passageiros", "diasComPagamento", "operacoesBalcao"],
      }
    );

    addTableSheet(
      wb,
      "Pagamentos dia",
      [
        { header: "Data", key: "data", width: 14 },
        { header: "Mes", key: "mes", width: 12 },
        { header: "Funcionario", key: "funcionario", width: 30 },
        { header: "Login", key: "login", width: 18 },
        { header: "C1", key: "c1", width: 14 },
        { header: "C2", key: "c2", width: 14 },
        { header: "C3 rateio", key: "c3", width: 14 },
        { header: "Bruto", key: "bruto", width: 14 },
        { header: "Imposto", key: "imposto", width: 14 },
        { header: "Taxa reembolsada", key: "taxa", width: 18 },
        { header: "Liquido", key: "liquido", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Pago em", key: "pagoEm", width: 22 },
        { header: "Pago por", key: "pagoPor", width: 24 },
      ],
      payouts.map((p) => {
        const b = (p.breakdown || {}) as Record<string, unknown>;
        return {
          data: dateBR(p.date),
          mes: String(p.date || "").slice(0, 7),
          funcionario: p.user?.name || "",
          login: p.user?.login || "",
          c1: cents(safeInt(b.commission1Cents, 0)),
          c2: cents(safeInt(b.commission2Cents, 0)),
          c3: cents(safeInt(b.commission3RateioCents, 0)),
          bruto: cents(safeInt(p.grossProfitCents, 0)),
          imposto: cents(safeInt(p.tax7Cents, 0)),
          taxa: cents(safeInt(p.feeCents, 0)),
          liquido: cents(safeInt(p.netPayCents, 0)),
          status: p.paidAt || p.paidById ? "Pago" : "Pendente",
          pagoEm: dateTimeISO(p.paidAt),
          pagoPor: p.paidBy?.name || p.paidBy?.login || "",
        };
      }),
      { moneyKeys: ["c1", "c2", "c3", "bruto", "imposto", "taxa", "liquido"] }
    );

    const lossTableRows = lossRows
      .sort((a, b) => {
        const da = a.finalizedAt ? a.finalizedAt.getTime() : 0;
        const db = b.finalizedAt ? b.finalizedAt.getTime() : 0;
        return da - db;
      })
      .map((r) => ({
        tipo: r.lossType,
        data: r.finalizedAt ? dateBR(isoDayUTC(r.finalizedAt)) : "",
        mes: r.finalizedAt ? isoDayUTC(r.finalizedAt).slice(0, 7) : "",
        numero: r.numero,
        programa: r.ciaAerea,
        cedente: r.cedenteNome,
        identificador: r.cedenteIdentificador,
        vendas: r.salesCount,
        pontosVendidos: r.soldPoints,
        passageiros: r.passengers,
        vendidoSemTaxa: cents(r.salesPointsValueCents),
        taxasVenda: cents(r.salesTaxesCents),
        custoCompra: cents(r.totalCents),
        bonus: cents(r.bonusCents),
        lucroBruto: cents(r.profitBrutoCents),
        prejuizo: cents(r.profitLiquidoCents),
        milheiroMedio: r.avgMilheiroCents == null ? null : cents(r.avgMilheiroCents),
        finalizadoPor: r.finalizedBy,
      }));

    addTableSheet(
      wb,
      "Prejuizos",
      [
        { header: "Tipo", key: "tipo", width: 22 },
        { header: "Data", key: "data", width: 14 },
        { header: "Mes", key: "mes", width: 12 },
        { header: "Numero/localizador", key: "numero", width: 24 },
        { header: "Programa", key: "programa", width: 12 },
        { header: "Cedente", key: "cedente", width: 34 },
        { header: "Identificador", key: "identificador", width: 18 },
        { header: "Vendas", key: "vendas", width: 12 },
        { header: "Pontos vendidos", key: "pontosVendidos", width: 18 },
        { header: "PAX", key: "passageiros", width: 12 },
        { header: "Vendido sem taxa", key: "vendidoSemTaxa", width: 18 },
        { header: "Taxas venda", key: "taxasVenda", width: 16 },
        { header: "Custo compra", key: "custoCompra", width: 16 },
        { header: "Bonus", key: "bonus", width: 14 },
        { header: "Lucro bruto", key: "lucroBruto", width: 16 },
        { header: "Prejuizo", key: "prejuizo", width: 16 },
        { header: "Milheiro medio", key: "milheiroMedio", width: 16 },
        { header: "Finalizado por", key: "finalizadoPor", width: 24 },
      ],
      lossTableRows,
      {
        moneyKeys: ["vendidoSemTaxa", "taxasVenda", "custoCompra", "bonus", "lucroBruto", "prejuizo", "milheiroMedio"],
        integerKeys: ["vendas", "pontosVendidos", "passageiros"],
      }
    );

    addTableSheet(
      wb,
      "Compras finalizadas",
      [
        { header: "Data finalizacao", key: "data", width: 18 },
        { header: "Mes", key: "mes", width: 12 },
        { header: "Numero", key: "numero", width: 16 },
        { header: "Programa", key: "programa", width: 12 },
        { header: "Cedente", key: "cedente", width: 34 },
        { header: "Identificador", key: "identificador", width: 18 },
        { header: "Vendas", key: "vendas", width: 12 },
        { header: "Pontos cia total", key: "pontosCiaTotal", width: 18 },
        { header: "Pontos vendidos", key: "pontosVendidos", width: 18 },
        { header: "Pontos restantes", key: "pontosRestantes", width: 18 },
        { header: "PAX", key: "passageiros", width: 12 },
        { header: "Vendido sem taxa", key: "vendidoSemTaxa", width: 18 },
        { header: "Total vendido", key: "totalVendido", width: 18 },
        { header: "Custo compra", key: "custoCompra", width: 16 },
        { header: "Bonus", key: "bonus", width: 14 },
        { header: "Lucro bruto", key: "lucroBruto", width: 16 },
        { header: "Lucro liquido", key: "lucroLiquido", width: 16 },
        { header: "Milheiro medio", key: "milheiroMedio", width: 16 },
        { header: "Meta milheiro", key: "metaMilheiro", width: 16 },
        { header: "Tem venda", key: "temVenda", width: 12 },
        { header: "Finalizado por", key: "finalizadoPor", width: 24 },
      ],
      computedPurchases.map((r) => ({
        data: dateTimeISO(r.finalizedAt),
        mes: r.finalizedAt ? isoDayUTC(r.finalizedAt).slice(0, 7) : "",
        numero: r.numero,
        programa: r.ciaAerea,
        cedente: r.cedenteNome,
        identificador: r.cedenteIdentificador,
        vendas: r.salesCount,
        pontosCiaTotal: r.pontosCiaTotal,
        pontosVendidos: r.soldPoints,
        pontosRestantes: r.remainingPoints,
        passageiros: r.passengers,
        vendidoSemTaxa: cents(r.salesPointsValueCents),
        totalVendido: cents(r.salesTotalCents),
        custoCompra: cents(r.totalCents),
        bonus: cents(r.bonusCents),
        lucroBruto: cents(r.profitBrutoCents),
        lucroLiquido: cents(r.profitLiquidoCents),
        milheiroMedio: r.avgMilheiroCents == null ? null : cents(r.avgMilheiroCents),
        metaMilheiro: cents(r.metaMilheiroCents),
        temVenda: r.hasSales ? "Sim" : "Nao",
        finalizadoPor: r.finalizedBy,
      })),
      {
        moneyKeys: ["vendidoSemTaxa", "totalVendido", "custoCompra", "bonus", "lucroBruto", "lucroLiquido", "milheiroMedio", "metaMilheiro"],
        integerKeys: ["vendas", "pontosCiaTotal", "pontosVendidos", "pontosRestantes", "passageiros"],
      }
    );

    addTableSheet(
      wb,
      "Vendas detalhadas",
      [
        { header: "Data", key: "data", width: 14 },
        { header: "Mes", key: "mes", width: 12 },
        { header: "Numero", key: "numero", width: 16 },
        { header: "Programa", key: "programa", width: 12 },
        { header: "Cliente", key: "cliente", width: 32 },
        { header: "Documento cliente", key: "docCliente", width: 18 },
        { header: "Cedente", key: "cedente", width: 32 },
        { header: "Vendedor", key: "vendedor", width: 28 },
        { header: "Pontos", key: "pontos", width: 14 },
        { header: "PAX", key: "passageiros", width: 12 },
        { header: "Milheiro", key: "milheiro", width: 14 },
        { header: "Valor pontos", key: "valorPontos", width: 16 },
        { header: "Taxa embarque", key: "taxaEmbarque", width: 16 },
        { header: "Total", key: "total", width: 16 },
        { header: "Status", key: "status", width: 14 },
        { header: "Pago em", key: "pagoEm", width: 20 },
        { header: "Localizador", key: "localizador", width: 18 },
        { header: "Compra vinculada", key: "compra", width: 20 },
      ],
      sales.map((s) => {
        const day = isoDayUTC(new Date(s.date));
        return {
          data: dateBR(day),
          mes: day.slice(0, 7),
          numero: s.numero,
          programa: String(s.program || ""),
          cliente: s.cliente?.nome || "",
          docCliente: s.cliente?.cpfCnpj || s.cliente?.identificador || "",
          cedente: s.cedente?.nomeCompleto || "",
          vendedor: s.seller?.name || "Sem vendedor",
          pontos: safeInt(s.points, 0),
          passageiros: safeInt(s.passengers, 0),
          milheiro: cents(safeInt(s.milheiroCents, 0)),
          valorPontos: cents(salePointsValueCents(s)),
          taxaEmbarque: cents(safeInt(s.embarqueFeeCents, 0)),
          total: cents(saleTotalCents(s)),
          status: String(s.paymentStatus || ""),
          pagoEm: dateTimeISO(s.paidAt),
          localizador: s.locator || "",
          compra: s.purchaseId || s.purchaseCode || "",
        };
      }),
      {
        moneyKeys: ["milheiro", "valorPontos", "taxaEmbarque", "total"],
        integerKeys: ["pontos", "passageiros"],
      }
    );

    addTableSheet(
      wb,
      "Balcao detalhado",
      [
        { header: "Data", key: "data", width: 14 },
        { header: "Mes", key: "mes", width: 12 },
        { header: "Companhia", key: "companhia", width: 16 },
        { header: "Localizador", key: "localizador", width: 18 },
        { header: "Funcionario", key: "funcionario", width: 28 },
        { header: "Cliente final", key: "clienteFinal", width: 32 },
        { header: "Fornecedor", key: "fornecedor", width: 32 },
        { header: "Pontos", key: "pontos", width: 14 },
        { header: "Taxa compra", key: "taxaCompra", width: 14 },
        { header: "Taxa venda", key: "taxaVenda", width: 14 },
        { header: "Pago fornecedor", key: "pagoFornecedor", width: 18 },
        { header: "Taxa embarque", key: "taxaEmbarque", width: 16 },
        { header: "Cobrado cliente", key: "cobradoCliente", width: 18 },
        { header: "Lucro bruto", key: "lucroBruto", width: 16 },
        { header: "Imposto", key: "imposto", width: 14 },
        { header: "Lucro liquido", key: "lucroLiquido", width: 16 },
        { header: "Comissao funcionario", key: "comissaoFuncionario", width: 22 },
        { header: "Imposto %", key: "impostoPercent", width: 12 },
      ],
      balcaoOps.map((op) => {
        const day = recifeDateISO(op.createdAt);
        const computed = balcaoComputedById.get(op.id) || makeBalcaoComputed(op, taxRule);
        return {
          data: dateBR(day),
          mes: day.slice(0, 7),
          companhia: String(op.airline || ""),
          localizador: op.locator || "",
          funcionario: op.employee?.name || "Sem funcionario",
          clienteFinal: op.finalCliente?.nome || "",
          fornecedor: op.supplierCliente?.nome || "",
          pontos: safeInt(op.points, 0),
          taxaCompra: cents(safeInt(op.buyRateCents, 0)),
          taxaVenda: cents(safeInt(op.sellRateCents, 0)),
          pagoFornecedor: cents(safeInt(op.supplierPayCents, 0)),
          taxaEmbarque: cents(safeInt(op.boardingFeeCents, 0)),
          cobradoCliente: cents(safeInt(op.customerChargeCents, 0)),
          lucroBruto: cents(computed.profitCents),
          imposto: cents(computed.taxCents),
          lucroLiquido: cents(computed.netProfitCents),
          comissaoFuncionario: cents(computed.sellerCommissionCents),
          impostoPercent: computed.taxPercent / 100,
        };
      }),
      {
        moneyKeys: [
          "taxaCompra",
          "taxaVenda",
          "pagoFornecedor",
          "taxaEmbarque",
          "cobradoCliente",
          "lucroBruto",
          "imposto",
          "lucroLiquido",
          "comissaoFuncionario",
        ],
        integerKeys: ["pontos"],
        percentKeys: ["impostoPercent"],
      }
    );

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `analise_empresa_${todayISO}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = errorMessage(error);
    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: message || "Falha ao exportar XLSX completo" },
      { status: 500 }
    );
  }
}
