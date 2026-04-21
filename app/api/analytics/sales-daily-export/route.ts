import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportRange = 30 | 60 | 90 | 120 | 180 | 365 | "ALL";

type DailyHistoryAgg = {
  salesCents: number;
  balcaoCents: number;
};

type DailyHistoryRow = {
  key: string;
  salesCents: number;
  balcaoCents: number;
  grossCents: number;
};

const VALID_RANGES: ExportRange[] = [30, 60, 90, 120, 180, 365, "ALL"];

function isoDateNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc: Record<string, string>, p) => {
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

function dayBoundsUTC(yyyyMmDd: string) {
  const start = dayStartUTC(yyyyMmDd);
  const end = addDaysUTC(start, 1);
  return { start, end };
}

function isoDayUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateBR(iso: string) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso || "—";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function pointsValueCents(points: number, milheiroCents: number) {
  const p = Math.max(0, Number(points || 0));
  const mk = Math.max(0, Number(milheiroCents || 0));
  const denom = p / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * mk);
}

function saleTeamWhere(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { sellerId: null, cedente: { owner: { team } } },
    ],
  };
}

function rangeLabel(range: ExportRange) {
  if (range === "ALL") return "Todo período";
  if (range === 365) return "1 ano";
  return `${range} dias`;
}

function filenameRangePart(range: ExportRange) {
  if (range === "ALL") return "todo_periodo";
  if (range === 365) return "1_ano";
  return `${range}_dias`;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, lastCol: number) {
  const row = ws.getRow(rowNumber);
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

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "TIME_NOT_FOUND" }, { status: 400 });
    }

    const rawRange = String(req.nextUrl.searchParams.get("range") || "30").trim().toUpperCase();
    const range: ExportRange =
      rawRange === "ALL" ? "ALL" : ((Number(rawRange) || 30) as ExportRange);

    if (!VALID_RANGES.includes(range)) {
      return NextResponse.json({ ok: false, error: "RANGE_INVALID" }, { status: 400 });
    }

    const notCanceled: Prisma.SaleWhereInput = { paymentStatus: { not: "CANCELED" as any } };
    const todayISO = isoDateNowSP();

    const [allSalesHistory, allBalcaoHistory] = await Promise.all([
      prisma.sale.findMany({
        where: {
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

    for (const sale of allSalesHistory) {
      const key = isoDayUTC(new Date(sale.date as any));
      const cur = ensureDailyHistory(key);
      cur.salesCents += pointsValueCents(Number(sale.points || 0), Number(sale.milheiroCents || 0));
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

    const fullHistory: DailyHistoryRow[] = [];
    for (let d = new Date(historyStart); d < historyEndExclusive; d = addDaysUTC(d, 1)) {
      const key = isoDayUTC(d);
      const cur = dailyHistoryAgg.get(key) || { salesCents: 0, balcaoCents: 0 };
      fullHistory.push({
        key,
        salesCents: cur.salesCents,
        balcaoCents: cur.balcaoCents,
        grossCents: cur.salesCents + cur.balcaoCents,
      });
    }

    const rows = range === "ALL" ? fullHistory : fullHistory.slice(-range);
    const totalCents = rows.reduce((acc, row) => acc + row.grossCents, 0);
    const avgCents = rows.length ? Math.round(totalCents / rows.length) : 0;
    const bestRow =
      rows.length > 0
        ? rows.reduce((best, row) => (row.grossCents > best.grossCents ? row : best), rows[0])
        : null;

    const wb = new ExcelJS.Workbook();
    wb.creator = "TradeMiles";
    wb.created = new Date();

    const wsSummary = wb.addWorksheet("Resumo");
    wsSummary.columns = [
      { header: "Campo", key: "field", width: 34 },
      { header: "Valor", key: "value", width: 30 },
    ];
    styleHeaderRow(wsSummary, 1, 2);
    wsSummary.addRow({ field: "Período", value: rangeLabel(range) });
    wsSummary.addRow({ field: "Dias exportados", value: rows.length });
    wsSummary.addRow({ field: "Total vendido", value: totalCents / 100 });
    wsSummary.addRow({ field: "Média por dia", value: avgCents / 100 });
    wsSummary.addRow({
      field: "Maior dia",
      value: bestRow
        ? `${dateBR(bestRow.key)} — ${((bestRow.grossCents || 0) / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}`
        : "—",
    });
    wsSummary.getCell("B4").numFmt = '"R$"#,##0.00;[Red]-"R$"#,##0.00';
    wsSummary.getCell("B5").numFmt = '"R$"#,##0.00;[Red]-"R$"#,##0.00';

    const ws = wb.addWorksheet("Vendas por dia");
    ws.columns = [
      { header: "Data", key: "date", width: 14 },
      { header: "Milhas", key: "sales", width: 18 },
      { header: "Balcão", key: "balcao", width: 18 },
      { header: "Total do dia", key: "gross", width: 18 },
    ];
    styleHeaderRow(ws, 1, 4);
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of rows) {
      ws.addRow({
        date: dateBR(row.key),
        sales: row.salesCents / 100,
        balcao: row.balcaoCents / 100,
        gross: row.grossCents / 100,
      });
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      ws.getCell(`B${r}`).numFmt = '"R$"#,##0.00;[Red]-"R$"#,##0.00';
      ws.getCell(`C${r}`).numFmt = '"R$"#,##0.00;[Red]-"R$"#,##0.00';
      ws.getCell(`D${r}`).numFmt = '"R$"#,##0.00;[Red]-"R$"#,##0.00';
      ws.getCell(`B${r}`).alignment = { horizontal: "right" };
      ws.getCell(`C${r}`).alignment = { horizontal: "right" };
      ws.getCell(`D${r}`).alignment = { horizontal: "right" };
    }

    const filename = `vendas_por_dia_${filenameRangePart(range)}_${todayISO}.xlsx`;
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: error?.message || "Falha ao exportar XLSX" },
      { status: 500 }
    );
  }
}
