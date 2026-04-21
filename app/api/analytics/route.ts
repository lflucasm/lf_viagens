// app/api/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import type { Prisma } from "@prisma/client";
import {
  balcaoProfitSemTaxaCents,
  buildTaxRule,
  netProfitAfterTaxCents,
  recifeDateISO,
  resolveTaxPercent,
  taxFromProfitCents,
} from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ProgramOrAll = Program | "ALL";
type TopMode = "MONTH" | "TOTAL";
type ChartMode = "MONTH" | "DAY";

function clampInt(v: any, fb = 0, min = -Infinity, max = Infinity) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
}

function isYYYYMM(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}
function isYYYYMMDD(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function isoMonthNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`; // YYYY-MM
}

// ✅ HOJE (SP)
function isoDateNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`; // YYYY-MM-DD
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
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(dt)
    .replace(".", "");
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
function dayBoundsUTC(yyyyMmDd: string) {
  const start = dayStartUTC(yyyyMmDd);
  const end = addDaysUTC(start, 1);
  return { start, end };
}
function isoDayUTC(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function dayLabelPT(yyyyMmDd: string) {
  const [, mm, dd] = (yyyyMmDd || "").split("-");
  if (dd && mm) return `${dd}/${mm}`;
  return yyyyMmDd || "—";
}

const DOW_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dowLabelFromUTCDate(d: Date) {
  return DOW_PT[d.getUTCDay()] || "—";
}

function pointsValueCents(points: number, milheiroCents: number) {
  const p = Math.max(0, Number(points || 0));
  const mk = Math.max(0, Number(milheiroCents || 0));
  const denom = p / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * mk);
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
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

// ===== ✅ helpers p/ clubes por overlap (ativos no mês) =====
function safeDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function overlapsMonth(subscribedAt: Date | null, inactivatedAt: Date | null, mStart: Date, mEnd: Date) {
  if (!subscribedAt) return false;
  if (subscribedAt >= mEnd) return false;
  if (inactivatedAt && inactivatedAt < mStart) return false;
  return true;
}

function inactivatedInMonth(inactivatedAt: Date | null, mStart: Date, mEnd: Date) {
  if (!inactivatedAt) return false;
  return inactivatedAt >= mStart && inactivatedAt < mEnd;
}

// ✅ filtro de time para sales (pega vendas com sellerId null via cedente.owner.team)
function saleTeamWhere(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } }, // normal
      { sellerId: null, cedente: { owner: { team } } }, // fallback p/ dados antigos sem seller
    ],
  };
}

type EmpRow = {
  id: string;
  name: string;
  login: string;
  grossCents: number;
  salesCount: number;
  passengers: number;
};

type BalcaoAgg = {
  operationsCount: number;
  points: number;
  supplierPayCents: number;
  customerChargeCents: number;
  boardingFeeCents: number;
  profitCents: number;
  taxCents: number;
  netProfitCents: number;
};

type BalcaoRowLite = {
  id: string;
  airline: string;
  employeeId: string | null;
  points: number;
  supplierPayCents: number;
  customerChargeCents: number;
  boardingFeeCents: number;
  profitCents: number;
  createdAt: Date;
  employee: { id: string; name: string; login: string } | null;
};

type DailyHistoryAgg = {
  salesCents: number;
  balcaoCents: number;
};

function seedEmpMap(users: Array<{ id: string; name: string; login: string }>) {
  const map = new Map<string, EmpRow>();
  for (const u of users) {
    map.set(u.id, { id: u.id, name: u.name, login: u.login, grossCents: 0, salesCount: 0, passengers: 0 });
  }
  return map;
}

function ensureUnassigned(map: Map<string, EmpRow>) {
  const key = "__UNASSIGNED__";
  if (!map.has(key)) {
    map.set(key, { id: key, name: "Sem vendedor", login: "—", grossCents: 0, salesCount: 0, passengers: 0 });
  }
  return key;
}

function emptyBalcaoAgg(): BalcaoAgg {
  return {
    operationsCount: 0,
    points: 0,
    supplierPayCents: 0,
    customerChargeCents: 0,
    boardingFeeCents: 0,
    profitCents: 0,
    taxCents: 0,
    netProfitCents: 0,
  };
}

function toBalcaoSummaryOut(v: BalcaoAgg) {
  return {
    operationsCount: v.operationsCount,
    points: v.points,
    supplierPayCents: v.supplierPayCents,
    customerChargeCents: v.customerChargeCents,
    boardingFeeCents: v.boardingFeeCents,
    profitCents: v.profitCents,
    taxCents: v.taxCents,
    netProfitCents: v.netProfitCents,
  };
}

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");

    // ✅ Agora: qualquer usuário logado do time pode acessar
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const monthParam = (searchParams.get("month") || "").trim();
    const month = isYYYYMM(monthParam) ? monthParam : isoMonthNowSP();

    const programParam = (searchParams.get("program") || "ALL").toUpperCase().trim();
    const program: ProgramOrAll =
      programParam === "LATAM" || programParam === "SMILES" || programParam === "LIVELO" || programParam === "ESFERA"
        ? (programParam as Program)
        : "ALL";

    const monthsBack = clampInt(searchParams.get("monthsBack"), 12, 1, 36);

    const topModeParam = (searchParams.get("topMode") || "MONTH").toUpperCase().trim();
    const topMode: TopMode = topModeParam === "TOTAL" ? "TOTAL" : "MONTH";

    const topProgramParam = (searchParams.get("topProgram") || "ALL").toUpperCase().trim();
    const topProgram: ProgramOrAll =
      topProgramParam === "LATAM" ||
      topProgramParam === "SMILES" ||
      topProgramParam === "LIVELO" ||
      topProgramParam === "ESFERA"
        ? (topProgramParam as Program)
        : "ALL";

    const topLimit = clampInt(searchParams.get("topLimit"), 10, 1, 50);

    const chartParam = (searchParams.get("chart") || "MONTH").toUpperCase().trim();
    const chart: ChartMode = chartParam === "DAY" ? "DAY" : "MONTH";

    const daysBack = clampInt(searchParams.get("daysBack"), 30, 1, 365);
    const milheiroDaysBack = clampInt(searchParams.get("milheiroDaysBack"), 30, 1, 365);
    const fromQ = (searchParams.get("from") || "").trim(); // YYYY-MM-DD
    const toQ = (searchParams.get("to") || "").trim(); // YYYY-MM-DD

    const mStart = monthStartUTC(month);
    const mEnd = addMonthsUTC(mStart, 1);
    const currentMonth = isoMonthNowSP();
    const currentMonthStart = monthStartUTC(currentMonth);
    const currentMonthEnd = addMonthsUTC(currentMonthStart, 1);
    const previousMonthStart = addMonthsUTC(currentMonthStart, -1);
    const previousMonthEnd = currentMonthStart;
    const previousMonth = monthKeyUTC(previousMonthStart);

    const histStart = addMonthsUTC(mStart, -(monthsBack - 1));
    const histEnd = mEnd;

    const notCanceled: Prisma.SaleWhereInput = { paymentStatus: { not: "CANCELED" as any } };

    const teamUsers = await prisma.user.findMany({
      where: { team },
      select: { id: true, name: true, login: true },
      orderBy: { name: "asc" },
    });
    const teamUsersById = new Map(teamUsers.map((u) => [u.id, u] as const));

    // =========================
    // ✅ 0) HOJE (KPI) + HOJE POR FUNCIONÁRIO
    // =========================
    const todayISO = isoDateNowSP();
    const { start: tStart, end: tEnd } = dayBoundsUTC(todayISO);

    const todaySales = await prisma.sale.findMany({
      where: {
        date: { gte: tStart, lt: tEnd },
        ...(program !== "ALL" ? { program } : {}),
        ...saleTeamWhere(team),
        ...notCanceled,
      },
      select: {
        points: true,
        passengers: true,
        milheiroCents: true,
        embarqueFeeCents: true,

        sellerId: true,
        seller: { select: { id: true, name: true, login: true } },
      },
    });

    let grossToday = 0;
    let feeToday = 0;
    let totalToday = 0;
    let paxToday = 0;

    const byEmpToday = seedEmpMap(teamUsers);

    for (const s of todaySales) {
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      const fee = Math.max(0, Number(s.embarqueFeeCents || 0));
      const pax = Math.max(0, Number(s.passengers || 0));

      grossToday += gross;
      feeToday += fee;
      totalToday += gross + fee;
      paxToday += pax;

      const u = s.seller;

      if (u?.id) {
        const cur =
          byEmpToday.get(u.id) || ({
            id: u.id,
            name: u.name,
            login: u.login,
            grossCents: 0,
            salesCount: 0,
            passengers: 0,
          } as EmpRow);
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmpToday.set(u.id, cur);
        continue;
      }

      if (s.sellerId) {
        const base = teamUsersById.get(s.sellerId);
        const id = s.sellerId;

        const cur =
          byEmpToday.get(id) || ({
            id,
            name: base?.name || "Vendedor",
            login: base?.login || "—",
            grossCents: 0,
            salesCount: 0,
            passengers: 0,
          } as EmpRow);

        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmpToday.set(id, cur);
        continue;
      }

      const key = ensureUnassigned(byEmpToday);
      const cur = byEmpToday.get(key)!;
      cur.grossCents += gross;
      cur.salesCount += 1;
      cur.passengers += pax;
      byEmpToday.set(key, cur);
    }

    const todayByEmployee = Array.from(byEmpToday.values()).sort((a, b) => b.grossCents - a.grossCents);

    const todayByEmployeeOut = todayByEmployee.map((r) => ({
      ...r,
      sales: r.salesCount,
      pax: r.passengers,
      totalCents: r.grossCents,
      totalSemTaxaCents: r.grossCents,
    }));

    // =========================
    // ✅ MÊS CORRENTE: vendas sem taxa vs lucro após imposto (sem taxa)
    // =========================
    const [currentMonthSales, currentMonthPayouts, previousMonthSales, previousMonthPayouts] = await Promise.all([
      prisma.sale.findMany({
        where: {
          date: { gte: currentMonthStart, lt: currentMonthEnd },
          ...saleTeamWhere(team),
          ...notCanceled,
        },
        select: { points: true, milheiroCents: true },
      }),
      prisma.employeePayout.findMany({
        where: {
          team,
          date: { startsWith: `${currentMonth}-` },
        },
        select: {
          grossProfitCents: true,
          tax7Cents: true,
        },
      }),
      prisma.sale.findMany({
        where: {
          date: { gte: previousMonthStart, lt: previousMonthEnd },
          ...saleTeamWhere(team),
          ...notCanceled,
        },
        select: { points: true, milheiroCents: true },
      }),
      prisma.employeePayout.findMany({
        where: {
          team,
          date: { startsWith: `${previousMonth}-` },
        },
        select: {
          grossProfitCents: true,
          tax7Cents: true,
        },
      }),
    ]);

    const currentMonthSoldWithoutFeeCents = currentMonthSales.reduce(
      (acc, s) =>
        acc + pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0)),
      0
    );

    const currentMonthProfitAfterTaxWithoutFeeRawCents = currentMonthPayouts.reduce(
      (acc, p) =>
        acc +
        (Math.max(0, Number(p.grossProfitCents || 0)) -
          Math.max(0, Number(p.tax7Cents || 0))),
      0
    );

    const previousMonthSoldWithoutFeeCents = previousMonthSales.reduce(
      (acc, s) =>
        acc + pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0)),
      0
    );

    const previousMonthProfitAfterTaxWithoutFeeRawCents = previousMonthPayouts.reduce(
      (acc, p) =>
        acc +
        (Math.max(0, Number(p.grossProfitCents || 0)) -
          Math.max(0, Number(p.tax7Cents || 0))),
      0
    );

    // =========================
    // 1) SALES (histórico p/ gráficos + mês selecionado)
    // =========================
    const salesHist = await prisma.sale.findMany({
      where: {
        date: { gte: histStart, lt: histEnd },
        ...(program !== "ALL" ? { program } : {}),
        ...saleTeamWhere(team),
        ...notCanceled,
      },
      select: {
        id: true,
        date: true,
        program: true,
        points: true,
        passengers: true,
        milheiroCents: true,
        embarqueFeeCents: true,
        paymentStatus: true,

        sellerId: true,
        seller: { select: { id: true, name: true, login: true } },
        cliente: { select: { id: true, nome: true, identificador: true } },
      },
      orderBy: { date: "asc" },
    });

    const monthSales = salesHist.filter((s) => {
      const d = new Date(s.date as any);
      return d >= mStart && d < mEnd;
    });

    // =========================
    // ✅ 1b) SÉRIE DIÁRIA (para gráfico diário)
    // =========================
    let dailyStart: Date;
    let dailyEndExclusive: Date;

    if (isYYYYMMDD(fromQ) && isYYYYMMDD(toQ)) {
      let a = dayStartUTC(fromQ);
      let b = dayStartUTC(toQ);
      if (a.getTime() > b.getTime()) {
        const tmp = a;
        a = b;
        b = tmp;
      }
      dailyStart = a;
      dailyEndExclusive = addDaysUTC(b, 1);

      const maxEnd = addDaysUTC(dailyStart, 365);
      if (dailyEndExclusive.getTime() > maxEnd.getTime()) {
        dailyEndExclusive = maxEnd;
      }
    } else {
      const { end } = dayBoundsUTC(todayISO);
      dailyEndExclusive = end;
      dailyStart = addDaysUTC(dailyEndExclusive, -daysBack);
    }

    let days: Array<{ key: string; label: string; grossCents: number }> = [];
    let milheiroDaily: Array<{
      key: string;
      label: string;
      latamMilheiroCents: number;
      smilesMilheiroCents: number;
    }> = [];

    const dailySales = await prisma.sale.findMany({
      where: {
        date: { gte: dailyStart, lt: dailyEndExclusive },
        ...(program !== "ALL" ? { program } : {}),
        ...saleTeamWhere(team),
        ...notCanceled,
      },
      select: { date: true, points: true, milheiroCents: true },
      orderBy: { date: "asc" },
    });

    const agg = new Map<string, number>();
    for (const s of dailySales) {
      const k = isoDayUTC(new Date(s.date as any));
      const points = Number(s.points || 0);
      const gross = pointsValueCents(points, Number(s.milheiroCents || 0));
      agg.set(k, (agg.get(k) || 0) + gross);
    }

    const out: Array<{ key: string; label: string; grossCents: number }> = [];
    for (let d = new Date(dailyStart); d < dailyEndExclusive; d = addDaysUTC(d, 1)) {
      const k = isoDayUTC(d);
      out.push({ key: k, label: dayLabelPT(k), grossCents: agg.get(k) || 0 });
    }
    days = out;

    const { end: milheiroEndExclusive } = dayBoundsUTC(todayISO);
    const milheiroStart = addDaysUTC(milheiroEndExclusive, -milheiroDaysBack);
    const milheiroSales = await prisma.sale.findMany({
      where: {
        date: { gte: milheiroStart, lt: milheiroEndExclusive },
        ...(program !== "ALL" ? { program } : {}),
        ...saleTeamWhere(team),
        ...notCanceled,
      },
      select: { date: true, points: true, milheiroCents: true, program: true },
      orderBy: { date: "asc" },
    });

    const aggMilheiro = new Map<
      string,
      { latamPoints: number; latamValueCents: number; smilesPoints: number; smilesValueCents: number }
    >();
    for (const s of milheiroSales) {
      const k = isoDayUTC(new Date(s.date as any));
      const points = Number(s.points || 0);
      const gross = pointsValueCents(points, Number(s.milheiroCents || 0));
      const cur = aggMilheiro.get(k) || {
        latamPoints: 0,
        latamValueCents: 0,
        smilesPoints: 0,
        smilesValueCents: 0,
      };

      if (s.program === "LATAM") {
        cur.latamPoints += Math.max(0, points);
        cur.latamValueCents += gross;
      } else if (s.program === "SMILES") {
        cur.smilesPoints += Math.max(0, points);
        cur.smilesValueCents += gross;
      }

      aggMilheiro.set(k, cur);
    }

    const outMil: Array<{
      key: string;
      label: string;
      latamMilheiroCents: number;
      smilesMilheiroCents: number;
    }> = [];
    for (let d = new Date(milheiroStart); d < milheiroEndExclusive; d = addDaysUTC(d, 1)) {
      const k = isoDayUTC(d);
      const rowMil = aggMilheiro.get(k) || {
        latamPoints: 0,
        latamValueCents: 0,
        smilesPoints: 0,
        smilesValueCents: 0,
      };
      outMil.push({
        key: k,
        label: dayLabelPT(k),
        latamMilheiroCents: milheiroFrom(rowMil.latamPoints, rowMil.latamValueCents),
        smilesMilheiroCents: milheiroFrom(rowMil.smilesPoints, rowMil.smilesValueCents),
      });
    }
    milheiroDaily = outMil;

    // =========================
    // 2) RESUMO DO MÊS
    // =========================
    let grossMonth = 0;
    let feeMonth = 0;
    let totalMonth = 0;
    let paxMonth = 0;

    for (const s of monthSales) {
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      const fee = Math.max(0, Number(s.embarqueFeeCents || 0));
      grossMonth += gross;
      feeMonth += fee;
      totalMonth += gross + fee;
      paxMonth += Math.max(0, Number(s.passengers || 0));
    }

    // =========================
    // 3) DIA DA SEMANA
    // =========================
    const byDow = new Map<string, { gross: number; sales: number; pax: number }>();
    for (const lab of DOW_PT) byDow.set(lab, { gross: 0, sales: 0, pax: 0 });

    for (const s of monthSales) {
      const d = new Date(s.date as any);
      const lab = dowLabelFromUTCDate(d);
      const cur = byDow.get(lab) || { gross: 0, sales: 0, pax: 0 };
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      cur.gross += gross;
      cur.sales += 1;
      cur.pax += Math.max(0, Number(s.passengers || 0));
      byDow.set(lab, cur);
    }

    const byDowArr = DOW_PT.map((lab) => {
      const v = byDow.get(lab) || { gross: 0, sales: 0, pax: 0 };
      const pct = grossMonth > 0 ? v.gross / grossMonth : 0;
      return { dow: lab, grossCents: v.gross, pct, salesCount: v.sales, passengers: v.pax };
    });

    let best = byDowArr[0] || { dow: "—", grossCents: 0, pct: 0, salesCount: 0, passengers: 0 };
    for (const r of byDowArr) if (r.grossCents > best.grossCents) best = r;

    // =========================
    // 4) VENDAS POR FUNCIONÁRIO (mês) — SEMPRE MOSTRA TODO MUNDO
    // =========================
    const byEmp = seedEmpMap(teamUsers);

    for (const s of monthSales) {
      const gross = pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      const pax = Math.max(0, Number(s.passengers || 0));

      const u = (s as any).seller as { id: string; name: string; login: string } | null;
      const sellerId = (s as any).sellerId as string | null;

      if (u?.id) {
        const cur =
          byEmp.get(u.id) || ({ id: u.id, name: u.name, login: u.login, grossCents: 0, salesCount: 0, passengers: 0 } as EmpRow);
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmp.set(u.id, cur);
      } else if (sellerId) {
        const base = teamUsersById.get(sellerId);
        const cur =
          byEmp.get(sellerId) ||
          ({
            id: sellerId,
            name: base?.name || "Vendedor",
            login: base?.login || "—",
            grossCents: 0,
            salesCount: 0,
            passengers: 0,
          } as EmpRow);
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmp.set(sellerId, cur);
      } else {
        const key = ensureUnassigned(byEmp);
        const cur = byEmp.get(key)!;
        cur.grossCents += gross;
        cur.salesCount += 1;
        cur.passengers += pax;
        byEmp.set(key, cur);
      }
    }

    const byEmployee = Array.from(byEmp.values()).sort((a, b) => b.grossCents - a.grossCents);

    // =========================
    // 5) EVOLUÇÃO MÊS A MÊS + MÉDIA (histórico)
    // =========================
    const monthKeys: string[] = [];
    for (let i = 0; i < monthsBack; i++) {
      monthKeys.push(monthKeyUTC(addMonthsUTC(histStart, i)));
    }

    const payoutHist = await prisma.employeePayout.findMany({
      where: {
        team,
        date: {
          gte: `${monthKeys[0]}-01`,
          lt: `${monthKeyUTC(addMonthsUTC(monthStartUTC(monthKeys[monthKeys.length - 1]), 1))}-01`,
        },
      },
      select: {
        date: true,
        grossProfitCents: true,
        tax7Cents: true,
      },
    });

    const lossMonthKeys = Array.from(new Set([...monthKeys, currentMonth, previousMonth])).sort();
    const lossByMonth = new Map<string, number>();
    for (const k of lossMonthKeys) lossByMonth.set(k, 0);

    const lossRangeStart = monthStartUTC(lossMonthKeys[0]);
    const lossRangeEnd = addMonthsUTC(monthStartUTC(lossMonthKeys[lossMonthKeys.length - 1]), 1);

    const lossPurchasesBase = await prisma.purchase.findMany({
      where: {
        status: "CLOSED",
        finalizedAt: { not: null, gte: lossRangeStart, lt: lossRangeEnd },
        cedente: { owner: { team } },
      },
      select: {
        id: true,
        numero: true,
        metaMilheiroCents: true,
        totalCents: true,
        finalizedAt: true,
      },
    });

    if (lossPurchasesBase.length > 0) {
      const purchaseIds = lossPurchasesBase.map((p) => p.id);
      const numeros = lossPurchasesBase.map((p) => String(p.numero || "").trim()).filter(Boolean);
      const numerosUpper = Array.from(new Set(numeros.map((n) => n.toUpperCase())));
      const numerosLower = Array.from(new Set(numeros.map((n) => n.toLowerCase())));
      const numerosAll = Array.from(new Set([...numeros, ...numerosUpper, ...numerosLower]));

      const idByNumeroUpper = new Map<string, string>(
        lossPurchasesBase
          .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
          .filter(([k]) => !!k)
      );
      const purchaseById = new Map(lossPurchasesBase.map((p) => [p.id, p] as const));

      const normalizePurchaseId = (raw: string) => {
        const r = (raw || "").trim();
        if (!r) return "";
        const up = r.toUpperCase();
        return idByNumeroUpper.get(up) || r;
      };

      const lossSales = await prisma.sale.findMany({
        where: {
          paymentStatus: { not: "CANCELED" as any },
          OR: [{ purchaseId: { in: purchaseIds } }, { purchaseId: { in: numerosAll } }],
        },
        select: {
          purchaseId: true,
          points: true,
          totalCents: true,
          pointsValueCents: true,
          embarqueFeeCents: true,
        },
      });

      const lossAgg = new Map<string, { soldPoints: number; salesCount: number; salesTotalCents: number; salesPointsValueCents: number; bonusCents: number }>();

      for (const s of lossSales) {
        const pid = normalizePurchaseId(String(s.purchaseId || ""));
        if (!pid) continue;

        const totalCents = safeInt(s.totalCents, 0);
        const feeCents = safeInt(s.embarqueFeeCents, 0);
        let pvCents = safeInt(s.pointsValueCents, 0);
        if (pvCents <= 0 && totalCents > 0) {
          const cand = Math.max(totalCents - feeCents, 0);
          pvCents = cand > 0 ? cand : totalCents;
        }

        const cur = lossAgg.get(pid) || {
          soldPoints: 0,
          salesCount: 0,
          salesTotalCents: 0,
          salesPointsValueCents: 0,
          bonusCents: 0,
        };

        const points = safeInt(s.points, 0);
        cur.soldPoints += points;
        cur.salesCount += 1;
        cur.salesTotalCents += totalCents;
        cur.salesPointsValueCents += pvCents;

        const p = purchaseById.get(pid);
        if (p) {
          const mil = milheiroFrom(points, pvCents);
          cur.bonusCents += bonus30(points, mil, safeInt(p.metaMilheiroCents, 0));
        }

        lossAgg.set(pid, cur);
      }

      for (const p of lossPurchasesBase) {
        const a = lossAgg.get(p.id) || {
          soldPoints: 0,
          salesCount: 0,
          salesTotalCents: 0,
          salesPointsValueCents: 0,
          bonusCents: 0,
        };

        const hasSales =
          safeInt(a.salesCount, 0) > 0 ||
          safeInt(a.salesPointsValueCents, 0) > 0 ||
          safeInt(a.salesTotalCents, 0) > 0 ||
          safeInt(a.soldPoints, 0) > 0;
        if (!hasSales) continue;

        const profitBruto = safeInt(a.salesPointsValueCents, 0) - safeInt(p.totalCents, 0);
        const profitLiquido = profitBruto - safeInt(a.bonusCents, 0);
        if (profitLiquido >= 0) continue;

        const mk = p.finalizedAt ? monthKeyUTC(new Date(p.finalizedAt as any)) : "";
        if (!mk || !lossByMonth.has(mk)) continue;
        lossByMonth.set(mk, (lossByMonth.get(mk) || 0) + profitLiquido);
      }
    }

    const aggByMonth = new Map<
      string,
      {
        gross: number;
        sales: number;
        pax: number;
        latam: number;
        smiles: number;
        livelo: number;
        esfera: number;
        latamPoints: number;
        latamValueCents: number;
        smilesPoints: number;
        smilesValueCents: number;
      }
    >();

    for (const k of monthKeys) {
      aggByMonth.set(k, {
        gross: 0,
        sales: 0,
        pax: 0,
        latam: 0,
        smiles: 0,
        livelo: 0,
        esfera: 0,
        latamPoints: 0,
        latamValueCents: 0,
        smilesPoints: 0,
        smilesValueCents: 0,
      });
    }

    for (const s of salesHist) {
      const d = new Date(s.date as any);
      const k = monthKeyUTC(d);
      const cur = aggByMonth.get(k);
      if (!cur) continue;

      const points = Number(s.points || 0);
      const gross = pointsValueCents(points, Number(s.milheiroCents || 0));
      cur.gross += gross;
      cur.sales += 1;
      cur.pax += Math.max(0, Number(s.passengers || 0));

      if (s.program === "LATAM") {
        cur.latam += gross;
        cur.latamPoints += Math.max(0, points);
        cur.latamValueCents += gross;
      } else if (s.program === "SMILES") {
        cur.smiles += gross;
        cur.smilesPoints += Math.max(0, points);
        cur.smilesValueCents += gross;
      } else if (s.program === "LIVELO") cur.livelo += gross;
      else if (s.program === "ESFERA") cur.esfera += gross;
    }

    const months = monthKeys.map((k) => {
      const cur = aggByMonth.get(k)!;
      return {
        key: k,
        label: monthLabelPT(k),
        grossCents: cur.gross,
        salesCount: cur.sales,
        passengers: cur.pax,
        byProgram: { LATAM: cur.latam, SMILES: cur.smiles, LIVELO: cur.livelo, ESFERA: cur.esfera },
        milheiroByProgram: {
          LATAM: milheiroFrom(cur.latamPoints, cur.latamValueCents),
          SMILES: milheiroFrom(cur.smilesPoints, cur.smilesValueCents),
        },
      };
    });

    const milheiroMonthly = monthKeys.map((k) => {
      const cur = aggByMonth.get(k)!;
      return {
        key: k,
        label: monthLabelPT(k),
        latamMilheiroCents: milheiroFrom(cur.latamPoints, cur.latamValueCents),
        smilesMilheiroCents: milheiroFrom(cur.smilesPoints, cur.smilesValueCents),
      };
    });

    const profitByMonth = new Map<string, number>();
    for (const k of monthKeys) profitByMonth.set(k, 0);

    for (const p of payoutHist) {
      const k = String(p.date || "").slice(0, 7);
      if (!profitByMonth.has(k)) continue;
      const grossProfit = Math.max(0, Number(p.grossProfitCents || 0));
      const tax = Math.max(0, Number(p.tax7Cents || 0));
      profitByMonth.set(k, (profitByMonth.get(k) || 0) + (grossProfit - tax));
    }

    const profitMonths = monthKeys.map((k) => {
      const sold = aggByMonth.get(k)?.gross || 0;
      const loss = lossByMonth.get(k) || 0;
      const profit = (profitByMonth.get(k) || 0) + loss;
      const profitPercent = sold > 0 ? (profit / sold) * 100 : null;
      return {
        key: k,
        label: monthLabelPT(k),
        soldWithoutFeeCents: sold,
        profitAfterTaxWithoutFeeCents: profit,
        lossCents: loss,
        profitPercent,
      };
    });

    // =========================
    // 5b) EMISSÕES DE BALCÃO (separado)
    // =========================
    const balcaoSettings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const balcaoTaxRule = buildTaxRule(balcaoSettings);

    const balcaoRangeStart = [histStart, previousMonthStart, currentMonthStart, tStart, dailyStart].reduce(
      (min, d) => (d.getTime() < min.getTime() ? d : min),
      histStart
    );
    const balcaoRangeEnd = [histEnd, previousMonthEnd, currentMonthEnd, tEnd, dailyEndExclusive].reduce(
      (max, d) => (d.getTime() > max.getTime() ? d : max),
      histEnd
    );

    const balcaoOps = await prisma.balcaoOperacao.findMany({
      where: {
        team,
        createdAt: { gte: balcaoRangeStart, lt: balcaoRangeEnd },
      },
      select: {
        id: true,
        airline: true,
        employeeId: true,
        points: true,
        supplierPayCents: true,
        customerChargeCents: true,
        boardingFeeCents: true,
        profitCents: true,
        createdAt: true,
        employee: { select: { id: true, name: true, login: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const balcaoTodayAgg = emptyBalcaoAgg();
    const balcaoMonthAgg = emptyBalcaoAgg();
    const balcaoCurrentMonthAgg = emptyBalcaoAgg();
    const balcaoPreviousMonthAgg = emptyBalcaoAgg();

    const balcaoByMonth = new Map<string, BalcaoAgg>();
    for (const k of monthKeys) balcaoByMonth.set(k, emptyBalcaoAgg());

    const balcaoByDay = new Map<string, BalcaoAgg>();
    for (let d = new Date(dailyStart); d < dailyEndExclusive; d = addDaysUTC(d, 1)) {
      const dk = isoDayUTC(d);
      balcaoByDay.set(dk, emptyBalcaoAgg());
    }

    const balcaoByAirline = new Map<string, BalcaoAgg>();
    const balcaoByEmployee = new Map<
      string,
      BalcaoAgg & { id: string; name: string; login: string }
    >();

    function inRange(d: Date, start: Date, end: Date) {
      const t = d.getTime();
      return t >= start.getTime() && t < end.getTime();
    }

    function accumulateBalcao(
      target: BalcaoAgg,
      row: BalcaoRowLite,
      computed: { profitCents: number; taxCents: number; netProfitCents: number }
    ) {
      target.operationsCount += 1;
      target.points += Math.max(0, Number(row.points || 0));
      target.supplierPayCents += Math.max(0, Number(row.supplierPayCents || 0));
      target.customerChargeCents += Math.max(0, Number(row.customerChargeCents || 0));
      target.boardingFeeCents += Math.max(0, Number(row.boardingFeeCents || 0));
      target.profitCents += computed.profitCents;
      target.taxCents += computed.taxCents;
      target.netProfitCents += computed.netProfitCents;
    }

    for (const op of balcaoOps) {
      const row: BalcaoRowLite = {
        id: op.id,
        airline: String(op.airline || ""),
        employeeId: op.employeeId || null,
        points: Number(op.points || 0),
        supplierPayCents: Number(op.supplierPayCents || 0),
        customerChargeCents: Number(op.customerChargeCents || 0),
        boardingFeeCents: Number(op.boardingFeeCents || 0),
        profitCents: Number(op.profitCents || 0),
        createdAt: op.createdAt,
        employee: op.employee || null,
      };

      const normalizedProfitCents = balcaoProfitSemTaxaCents({
        customerChargeCents: row.customerChargeCents,
        supplierPayCents: row.supplierPayCents,
        boardingFeeCents: row.boardingFeeCents,
      });
      const taxPercent = resolveTaxPercent(recifeDateISO(row.createdAt), balcaoTaxRule);
      const taxCents = taxFromProfitCents(normalizedProfitCents, taxPercent);
      const netProfitCents = netProfitAfterTaxCents(normalizedProfitCents, taxCents);
      const computed = {
        profitCents: normalizedProfitCents,
        taxCents,
        netProfitCents,
      };

      if (inRange(row.createdAt, tStart, tEnd)) {
        accumulateBalcao(balcaoTodayAgg, row, computed);
      }
      if (inRange(row.createdAt, mStart, mEnd)) {
        accumulateBalcao(balcaoMonthAgg, row, computed);

        const airlineAgg = balcaoByAirline.get(row.airline) || emptyBalcaoAgg();
        accumulateBalcao(airlineAgg, row, computed);
        balcaoByAirline.set(row.airline, airlineAgg);

        const empId = row.employee?.id || "__NO_EMPLOYEE__";
        const empAgg = balcaoByEmployee.get(empId) || {
          id: empId,
          name: row.employee?.name || "Sem funcionário",
          login: row.employee?.login || "—",
          ...emptyBalcaoAgg(),
        };
        accumulateBalcao(empAgg, row, computed);
        balcaoByEmployee.set(empId, empAgg);
      }
      if (inRange(row.createdAt, currentMonthStart, currentMonthEnd)) {
        accumulateBalcao(balcaoCurrentMonthAgg, row, computed);
      }
      if (inRange(row.createdAt, previousMonthStart, previousMonthEnd)) {
        accumulateBalcao(balcaoPreviousMonthAgg, row, computed);
      }

      const mk = monthKeyUTC(row.createdAt);
      if (balcaoByMonth.has(mk)) {
        const monthAgg = balcaoByMonth.get(mk)!;
        accumulateBalcao(monthAgg, row, computed);
        balcaoByMonth.set(mk, monthAgg);
      }

      const dk = isoDayUTC(row.createdAt);
      if (balcaoByDay.has(dk)) {
        const dayAgg = balcaoByDay.get(dk)!;
        accumulateBalcao(dayAgg, row, computed);
        balcaoByDay.set(dk, dayAgg);
      }
    }

    const balcaoByAirlineRows = Array.from(balcaoByAirline.entries())
      .map(([airline, agg]) => ({
        airline,
        ...toBalcaoSummaryOut(agg),
      }))
      .sort((a, b) => b.customerChargeCents - a.customerChargeCents);

    const balcaoByEmployeeRows = Array.from(balcaoByEmployee.values())
      .map((r) => ({
        id: r.id,
        name: r.name,
        login: r.login,
        ...toBalcaoSummaryOut(r),
      }))
      .sort((a, b) => b.customerChargeCents - a.customerChargeCents);

    const balcaoMonths = monthKeys.map((k) => ({
      key: k,
      label: monthLabelPT(k),
      ...toBalcaoSummaryOut(balcaoByMonth.get(k) || emptyBalcaoAgg()),
    }));

    const balcaoDays = Array.from(balcaoByDay.entries()).map(([k, agg]) => ({
      key: k,
      label: dayLabelPT(k),
      ...toBalcaoSummaryOut(agg),
    }));

    const currentMonthLossCents = lossByMonth.get(currentMonth) || 0;
    const previousMonthLossCents = lossByMonth.get(previousMonth) || 0;

    const selectedMonthSalesProfitAfterTaxWithoutFeeCents =
      (profitByMonth.get(month) || 0) + (lossByMonth.get(month) || 0);
    const selectedMonthConsolidatedSoldCents =
      grossMonth + balcaoMonthAgg.customerChargeCents;
    const selectedMonthConsolidatedProfitAfterTaxCents =
      selectedMonthSalesProfitAfterTaxWithoutFeeCents + balcaoMonthAgg.netProfitCents;

    const currentMonthProfitAfterTaxWithoutFeeCents =
      currentMonthProfitAfterTaxWithoutFeeRawCents + currentMonthLossCents;
    const previousMonthProfitAfterTaxWithoutFeeCents =
      previousMonthProfitAfterTaxWithoutFeeRawCents + previousMonthLossCents;

    const currentMonthSalesOverProfitRatio =
      currentMonthSoldWithoutFeeCents > 0
        ? currentMonthProfitAfterTaxWithoutFeeCents / currentMonthSoldWithoutFeeCents
        : null;

    const currentMonthSalesOverProfitPercent =
      currentMonthSalesOverProfitRatio === null
        ? null
        : currentMonthSalesOverProfitRatio * 100;

    const previousMonthProfitPercent =
      previousMonthSoldWithoutFeeCents > 0
        ? (previousMonthProfitAfterTaxWithoutFeeCents / previousMonthSoldWithoutFeeCents) * 100
        : null;

    const currentVsPreviousProfitDeltaCents =
      currentMonthProfitAfterTaxWithoutFeeCents - previousMonthProfitAfterTaxWithoutFeeCents;

    const currentVsPreviousProfitDeltaPercent =
      previousMonthProfitAfterTaxWithoutFeeCents > 0
        ? (currentVsPreviousProfitDeltaCents / previousMonthProfitAfterTaxWithoutFeeCents) * 100
        : null;

    const avgMonthlyGrossCents =
      months.length > 0 ? Math.round(months.reduce((acc, m) => acc + (m.grossCents || 0), 0) / months.length) : 0;

    // =========================
    // 6) CLUBES POR MÊS (SMILES + LATAM)
    // =========================
    let clubsByMonth: Array<{
      key: string;
      label: string;
      smiles: number;
      latam: number;
      smilesInactivated: number;
      latamInactivated: number;
    }> = monthKeys.map((k) => ({
      key: k,
      label: monthLabelPT(k),
      smiles: 0,
      latam: 0,
      smilesInactivated: 0,
      latamInactivated: 0,
    }));

    const clubs = await prisma.clubSubscription.findMany({
      where: {
        team,
        program: { in: ["SMILES", "LATAM"] as any },
        subscribedAt: { lt: histEnd },
        OR: [{ status: "ACTIVE" }, { status: { in: ["PAUSED", "CANCELED"] }, updatedAt: { gte: histStart } }],
      },
      select: {
        subscribedAt: true,
        program: true,
        status: true,
        updatedAt: true,
      },
    });

    {
      const idx = new Map<string, { smiles: number; latam: number; smilesInactivated: number; latamInactivated: number }>();
      for (const k of monthKeys) idx.set(k, { smiles: 0, latam: 0, smilesInactivated: 0, latamInactivated: 0 });

      for (const k of monthKeys) {
        const ms = monthStartUTC(k);
        const me = addMonthsUTC(ms, 1);
        const cur = idx.get(k)!;

        for (const c of clubs) {
          const subAt = safeDate(c.subscribedAt as any);
          const updAt = safeDate(c.updatedAt as any);
          if (!subAt || !updAt) continue;

          const inactivatedAt = c.status === "ACTIVE" ? null : updAt;

          if (overlapsMonth(subAt, inactivatedAt, ms, me)) {
            if (c.program === "SMILES") cur.smiles += 1;
            if (c.program === "LATAM") cur.latam += 1;
          }

          if (inactivatedInMonth(inactivatedAt, ms, me)) {
            if (c.program === "SMILES") cur.smilesInactivated += 1;
            if (c.program === "LATAM") cur.latamInactivated += 1;
          }
        }

        idx.set(k, cur);
      }

      clubsByMonth = monthKeys.map((k) => {
        const cur = idx.get(k) || { smiles: 0, latam: 0, smilesInactivated: 0, latamInactivated: 0 };
        return {
          key: k,
          label: monthLabelPT(k),
          smiles: cur.smiles,
          latam: cur.latam,
          smilesInactivated: cur.smilesInactivated,
          latamInactivated: cur.latamInactivated,
        };
      });
    }

    // =========================
    // 7) TOP CLIENTES (mês OU total, com filtro de programa)
    // =========================
    const topWhere: Prisma.SaleWhereInput = {
      ...(topMode === "MONTH" ? { date: { gte: mStart, lt: mEnd } } : { date: { gte: histStart, lt: histEnd } }),
      ...(topProgram !== "ALL" ? { program: topProgram } : {}),
      ...saleTeamWhere(team),
      ...notCanceled,
    };

    const topSales = await prisma.sale.findMany({
      where: topWhere,
      select: {
        points: true,
        passengers: true,
        milheiroCents: true,
        cliente: { select: { id: true, nome: true, identificador: true } },
      },
    });

    const byClient = new Map<
      string,
      { id: string; nome: string; identificador: string; gross: number; sales: number; pax: number }
    >();

    for (const s of topSales) {
      const c = s.cliente;
      if (!c?.id) continue;

      const key = c.id;
      const cur =
        byClient.get(key) || {
          id: c.id,
          nome: c.nome,
          identificador: c.identificador || "—",
          gross: 0,
          sales: 0,
          pax: 0,
        };

      cur.gross += pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      cur.sales += 1;
      cur.pax += Math.max(0, Number(s.passengers || 0));
      byClient.set(key, cur);
    }

    const topClients = Array.from(byClient.values())
      .sort((a, b) => b.gross - a.gross)
      .slice(0, topLimit)
      .map((x) => ({
        id: x.id,
        nome: x.nome,
        identificador: x.identificador,
        grossCents: x.gross,
        salesCount: x.sales,
        passengers: x.pax,
      }));

    // =========================
    // 8) HISTÓRICO COMPLETO CONSOLIDADO POR DIA (milhas + balcão)
    // =========================
    const [allSalesHistory, allBalcaoHistory] = await Promise.all([
      prisma.sale.findMany({
        where: {
          ...(program !== "ALL" ? { program } : {}),
          ...saleTeamWhere(team),
          ...notCanceled,
        },
        select: {
          date: true,
          points: true,
          milheiroCents: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma.balcaoOperacao.findMany({
        where: { team },
        select: {
          createdAt: true,
          customerChargeCents: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const dailyHistoryAgg = new Map<string, DailyHistoryAgg>();

    function ensureDailyHistory(key: string) {
      const cur = dailyHistoryAgg.get(key) || { salesCents: 0, balcaoCents: 0 };
      dailyHistoryAgg.set(key, cur);
      return cur;
    }

    for (const s of allSalesHistory) {
      const key = isoDayUTC(new Date(s.date as any));
      const cur = ensureDailyHistory(key);
      cur.salesCents += pointsValueCents(Number(s.points || 0), Number(s.milheiroCents || 0));
      dailyHistoryAgg.set(key, cur);
    }

    for (const op of allBalcaoHistory) {
      const key = isoDayUTC(new Date(op.createdAt as any));
      const cur = ensureDailyHistory(key);
      cur.balcaoCents += Math.max(0, Number(op.customerChargeCents || 0));
      dailyHistoryAgg.set(key, cur);
    }

    const firstSalesDate = allSalesHistory.length
      ? dayStartUTC(isoDayUTC(new Date(allSalesHistory[0].date as any)))
      : null;
    const firstBalcaoDate = allBalcaoHistory.length
      ? dayStartUTC(isoDayUTC(new Date(allBalcaoHistory[0].createdAt as any)))
      : null;
    const lastSalesDate = allSalesHistory.length
      ? dayStartUTC(isoDayUTC(new Date(allSalesHistory[allSalesHistory.length - 1].date as any)))
      : null;
    const lastBalcaoDate = allBalcaoHistory.length
      ? dayStartUTC(
          isoDayUTC(new Date(allBalcaoHistory[allBalcaoHistory.length - 1].createdAt as any))
        )
      : null;

    const historyStart =
      firstSalesDate && firstBalcaoDate
        ? firstSalesDate.getTime() <= firstBalcaoDate.getTime()
          ? firstSalesDate
          : firstBalcaoDate
        : firstSalesDate || firstBalcaoDate || dayStartUTC(todayISO);

    let historyEndExclusive = addDaysUTC(
      lastSalesDate && lastBalcaoDate
        ? lastSalesDate.getTime() >= lastBalcaoDate.getTime()
          ? lastSalesDate
          : lastBalcaoDate
        : lastSalesDate || lastBalcaoDate || dayStartUTC(todayISO),
      1
    );
    const todayEndExclusive = dayBoundsUTC(todayISO).end;
    if (historyEndExclusive.getTime() < todayEndExclusive.getTime()) {
      historyEndExclusive = todayEndExclusive;
    }

    const salesDailyHistory: Array<{
      key: string;
      label: string;
      salesCents: number;
      balcaoCents: number;
      grossCents: number;
    }> = [];

    for (let d = new Date(historyStart); d < historyEndExclusive; d = addDaysUTC(d, 1)) {
      const key = isoDayUTC(d);
      const cur = dailyHistoryAgg.get(key) || { salesCents: 0, balcaoCents: 0 };
      salesDailyHistory.push({
        key,
        label: key,
        salesCents: cur.salesCents,
        balcaoCents: cur.balcaoCents,
        grossCents: cur.salesCents + cur.balcaoCents,
      });
    }

    const chartFrom = chart === "DAY" && dailyStart ? isoDayUTC(dailyStart) : null;
    const chartTo = chart === "DAY" && dailyEndExclusive ? isoDayUTC(addDaysUTC(dailyEndExclusive, -1)) : null;

    return NextResponse.json(
      {
        ok: true,
        filters: {
          month,
          program,
          monthsBack,
          topMode,
          topProgram,
          topLimit,
          chart,
          daysBack: chart === "DAY" ? daysBack : undefined,
          from: chart === "DAY" ? (isYYYYMMDD(fromQ) ? fromQ : chartFrom) : undefined,
          to: chart === "DAY" ? (isYYYYMMDD(toQ) ? toQ : chartTo) : undefined,
          milheiroDaysBack,
        },

        today: {
          date: todayISO,
          grossCents: grossToday,
          feeCents: feeToday,
          totalCents: totalToday,
          salesCount: todaySales.length,
          passengers: paxToday,
        },

        balcao: {
          taxRule: {
            configuredPercent: balcaoTaxRule.configuredPercent,
            effectiveISO: balcaoTaxRule.effectiveISO,
          },
          today: toBalcaoSummaryOut(balcaoTodayAgg),
          month: {
            key: month,
            label: monthLabelPT(month),
            ...toBalcaoSummaryOut(balcaoMonthAgg),
          },
          currentMonth: {
            key: currentMonth,
            label: monthLabelPT(currentMonth),
            ...toBalcaoSummaryOut(balcaoCurrentMonthAgg),
          },
          previousMonth: {
            key: previousMonth,
            label: monthLabelPT(previousMonth),
            ...toBalcaoSummaryOut(balcaoPreviousMonthAgg),
          },
          days: balcaoDays,
          months: balcaoMonths,
          byAirline: balcaoByAirlineRows,
          byEmployee: balcaoByEmployeeRows,
        },

        consolidated: {
          month,
          label: monthLabelPT(month),
          soldSalesCents: grossMonth,
          soldBalcaoCents: balcaoMonthAgg.customerChargeCents,
          soldTotalCents: selectedMonthConsolidatedSoldCents,
          profitSalesAfterTaxWithoutFeeCents:
            selectedMonthSalesProfitAfterTaxWithoutFeeCents,
          profitBalcaoAfterTaxCents: balcaoMonthAgg.netProfitCents,
          profitTotalAfterTaxCents: selectedMonthConsolidatedProfitAfterTaxCents,
        },

        // ✅ HOJE POR FUNCIONÁRIO (com aliases)
        todayByEmployee: todayByEmployeeOut,
        byEmployeeToday: todayByEmployeeOut, // ✅ alias opcional p/ front antigo

        currentMonthPerformance: {
          month: currentMonth,
          soldWithoutFeeCents: currentMonthSoldWithoutFeeCents,
          profitAfterTaxWithoutFeeCents: currentMonthProfitAfterTaxWithoutFeeCents,
          lossCents: currentMonthLossCents,
          salesOverProfitRatio: currentMonthSalesOverProfitRatio,
          salesOverProfitPercent: currentMonthSalesOverProfitPercent,
        },
        currentVsPrevious: {
          currentMonth,
          previousMonth,
          current: {
            soldWithoutFeeCents: currentMonthSoldWithoutFeeCents,
            profitAfterTaxWithoutFeeCents: currentMonthProfitAfterTaxWithoutFeeCents,
            lossCents: currentMonthLossCents,
            profitPercent: currentMonthSalesOverProfitPercent,
          },
          previous: {
            soldWithoutFeeCents: previousMonthSoldWithoutFeeCents,
            profitAfterTaxWithoutFeeCents: previousMonthProfitAfterTaxWithoutFeeCents,
            lossCents: previousMonthLossCents,
            profitPercent: previousMonthProfitPercent,
          },
          delta: {
            profitCents: currentVsPreviousProfitDeltaCents,
            profitPercent: currentVsPreviousProfitDeltaPercent,
          },
        },

        summary: {
          monthLabel: monthLabelPT(month),
          grossCents: grossMonth,
          feeCents: feeMonth,
          totalCents: totalMonth,
          salesCount: monthSales.length,
          passengers: paxMonth,
          bestDayOfWeek: best,
        },

        days,
        milheiroDaily,

        byDow: byDowArr,
        byEmployee,

        months,
        milheiroMonthly,
        profitMonths,
        avgMonthlyGrossCents,

        clubsByMonth,
        topClients,
        salesDailyHistory,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro no analytics." }, { status: 400 });
  }
}
