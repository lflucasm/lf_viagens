import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 28;

const TABLE_HEADER_HEIGHT = 24;
const TABLE_ROW_HEIGHT = 20;
const TABLE_TOP_FIRST_PAGE = 312;
const TABLE_TOP_NEXT_PAGE = 96;
const TABLE_BOTTOM_LIMIT = PAGE_HEIGHT - 64;

type DayReport = {
  date: string;
  grossCents: number;
  taxCents: number;
  feeCents: number;
  lucroSemTaxaCents: number; // bruto - imposto
  c1Cents: number;
  c2Cents: number;
  c3Cents: number;
  salesCount: number;
};

type BreakdownExtract = {
  c1Cents: number;
  c2Cents: number;
  c3Cents: number;
  salesCount: number;
};

type CurrencySummary = {
  totalGross: number;
  totalTax: number;
  totalFee: number;
  totalLucroSemTaxa: number;
  totalC1: number;
  totalC2: number;
  totalC3: number;
  totalSales: number;
};

type StatsSummary = {
  gainDaysCount: number;
  avgGainCents: number;
  stdDevGainCents: number;
  bestDayLabel: string;
  bestDayValue: string;
};

type TableRow = {
  dateLabel: string;
  netLabel: string;
  c1Label: string;
  c2Label: string;
  c3Label: string;
  feeLabel: string;
  taxLabel: string;
  variation: "^" | "v" | "=" | "-";
};

type FontRef = "F1" | "F2";
type Align = "left" | "right" | "center";
type Rgb = [number, number, number];

const COLORS = {
  headerBg: [0.08, 0.16, 0.34] as Rgb,
  headerText: [1, 1, 1] as Rgb,
  bodyText: [0.12, 0.14, 0.18] as Rgb,
  muted: [0.38, 0.43, 0.5] as Rgb,
  cardBg: [0.96, 0.97, 0.99] as Rgb,
  border: [0.78, 0.83, 0.9] as Rgb,
  tableHeaderBg: [0.9, 0.94, 0.99] as Rgb,
  rowAltBg: [0.98, 0.985, 0.995] as Rgb,
  green: [0.14, 0.52, 0.32] as Rgb,
  red: [0.78, 0.2, 0.2] as Rgb,
} as const;

const TABLE_COLUMNS = [
  { key: "dateLabel", title: "Dia", width: 64, align: "left" as Align },
  { key: "netLabel", title: "Lucro s/taxa", width: 92, align: "right" as Align },
  { key: "c1Label", title: "C1", width: 68, align: "right" as Align },
  { key: "c2Label", title: "C2", width: 68, align: "right" as Align },
  { key: "c3Label", title: "C3", width: 68, align: "right" as Align },
  { key: "feeLabel", title: "Taxa", width: 68, align: "right" as Align },
  { key: "taxLabel", title: "Imposto", width: 68, align: "right" as Align },
  { key: "variation", title: "Var", width: 43, align: "center" as Align },
] as const;

function safeInt(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function toAscii(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function fmtMoneyBR(cents: number) {
  const n = safeInt(cents, 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const reais = Math.floor(abs / 100).toLocaleString("pt-BR");
  const dec = String(abs % 100).padStart(2, "0");
  return `${sign}R$ ${reais},${dec}`;
}

function fmtDateBR(isoDate: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtNowBR() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" });
}

function estimateTextWidth(text: string, fontSize: number) {
  return toAscii(text).length * fontSize * 0.52;
}

function mean(values: number[]) {
  if (!values.length) return 0;
  const total = values.reduce((acc, v) => acc + v, 0);
  return total / values.length;
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function parseBreakdown(value: Prisma.JsonValue | null): BreakdownExtract {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { c1Cents: 0, c2Cents: 0, c3Cents: 0, salesCount: 0 };
  }

  const obj = value as Record<string, unknown>;
  return {
    c1Cents: safeInt(obj.commission1Cents, 0),
    c2Cents: safeInt(obj.commission2Cents, 0),
    c3Cents: safeInt(obj.commission3RateioCents, 0),
    salesCount: safeInt(obj.salesCount, 0),
  };
}

class PdfCanvas {
  private commands: string[] = [];

  private yToPdf(top: number) {
    return PAGE_HEIGHT - top;
  }

  rect(opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    fill?: Rgb;
    stroke?: Rgb;
    lineWidth?: number;
  }) {
    const yPdf = PAGE_HEIGHT - opts.y - opts.h;
    if (opts.fill) {
      this.commands.push(
        `${opts.fill[0]} ${opts.fill[1]} ${opts.fill[2]} rg ${opts.x.toFixed(2)} ${yPdf.toFixed(2)} ${opts.w.toFixed(2)} ${opts.h.toFixed(2)} re f`
      );
    }

    if (opts.stroke) {
      const lw = opts.lineWidth ?? 1;
      this.commands.push(
        `${lw.toFixed(2)} w ${opts.stroke[0]} ${opts.stroke[1]} ${opts.stroke[2]} RG ${opts.x.toFixed(2)} ${yPdf.toFixed(2)} ${opts.w.toFixed(2)} ${opts.h.toFixed(2)} re S`
      );
    }
  }

  line(opts: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke?: Rgb;
    lineWidth?: number;
  }) {
    const stroke = opts.stroke ?? COLORS.border;
    const lw = opts.lineWidth ?? 1;
    this.commands.push(
      `${lw.toFixed(2)} w ${stroke[0]} ${stroke[1]} ${stroke[2]} RG ${opts.x1.toFixed(2)} ${this.yToPdf(opts.y1).toFixed(2)} m ${opts.x2.toFixed(2)} ${this.yToPdf(opts.y2).toFixed(2)} l S`
    );
  }

  text(opts: {
    text: string;
    x: number;
    y: number;
    width?: number;
    align?: Align;
    font?: FontRef;
    size?: number;
    color?: Rgb;
  }) {
    const font = opts.font ?? "F1";
    const size = opts.size ?? 10;
    const color = opts.color ?? COLORS.bodyText;
    const align = opts.align ?? "left";

    const raw = toAscii(opts.text);
    const safe = escapePdfText(raw);
    const width = opts.width ?? estimateTextWidth(raw, size);
    const textWidth = estimateTextWidth(raw, size);

    let x = opts.x;
    if (align === "right") {
      x = opts.x + width - textWidth;
    } else if (align === "center") {
      x = opts.x + (width - textWidth) / 2;
    }

    this.commands.push(
      `BT /${font} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg 1 0 0 1 ${x.toFixed(2)} ${this.yToPdf(opts.y).toFixed(2)} Tm (${safe}) Tj ET`
    );
  }

  build() {
    return this.commands.join("\n");
  }
}

function buildPdf(pages: string[]) {
  const pageCount = pages.length;
  const totalObjects = 4 + pageCount * 2;
  const objects = new Array<string>(totalObjects + 1).fill("");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  const kids: string[] = [];

  pages.forEach((content, idx) => {
    const pageObj = 5 + idx * 2;
    const contentObj = pageObj + 1;

    kids.push(`${pageObj} 0 R`);

    const contentLength = Buffer.byteLength(content, "utf8");
    objects[contentObj] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;

    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
  });

  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [ ${kids.join(" ")} ] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = new Array<number>(totalObjects + 1).fill(0);

  for (let i = 1; i <= totalObjects; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${totalObjects + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i <= totalObjects; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function computeCurrencySummary(days: DayReport[]): CurrencySummary {
  return days.reduce(
    (acc, d) => {
      acc.totalGross += d.grossCents;
      acc.totalTax += d.taxCents;
      acc.totalFee += d.feeCents;
      acc.totalLucroSemTaxa += d.lucroSemTaxaCents;
      acc.totalC1 += d.c1Cents;
      acc.totalC2 += d.c2Cents;
      acc.totalC3 += d.c3Cents;
      acc.totalSales += d.salesCount;
      return acc;
    },
    {
      totalGross: 0,
      totalTax: 0,
      totalFee: 0,
      totalLucroSemTaxa: 0,
      totalC1: 0,
      totalC2: 0,
      totalC3: 0,
      totalSales: 0,
    }
  );
}

function computeStats(days: DayReport[]): StatsSummary {
  const gains = days.map((d) => d.lucroSemTaxaCents);
  const avg = Math.round(mean(gains));
  const stdDev = Math.round(standardDeviation(gains));

  const best = days.reduce<DayReport | null>((acc, d) => {
    if (!acc) return d;
    return d.lucroSemTaxaCents > acc.lucroSemTaxaCents ? d : acc;
  }, null);

  return {
    gainDaysCount: days.length,
    avgGainCents: avg,
    stdDevGainCents: stdDev,
    bestDayLabel: best ? fmtDateBR(best.date) : "-",
    bestDayValue: best ? fmtMoneyBR(best.lucroSemTaxaCents) : "-",
  };
}

function buildTableRows(days: DayReport[]): TableRow[] {
  let previous: number | null = null;

  return days.map((d) => {
    let variation: "^" | "v" | "=" | "-" = "-";
    if (previous !== null) {
      if (d.lucroSemTaxaCents > previous) variation = "^";
      else if (d.lucroSemTaxaCents < previous) variation = "v";
      else variation = "=";
    }

    previous = d.lucroSemTaxaCents;

    return {
      dateLabel: fmtDateBR(d.date),
      netLabel: fmtMoneyBR(d.lucroSemTaxaCents),
      c1Label: fmtMoneyBR(d.c1Cents),
      c2Label: fmtMoneyBR(d.c2Cents),
      c3Label: fmtMoneyBR(d.c3Cents),
      feeLabel: fmtMoneyBR(d.feeCents),
      taxLabel: fmtMoneyBR(d.taxCents),
      variation,
    };
  });
}

function drawHeader(
  page: PdfCanvas,
  input: {
    isFirstPage: boolean;
    pageNumber: number;
    employeeName: string;
    login: string;
    month: string;
    generatedAt: string;
  }
) {
  if (input.isFirstPage) {
    page.rect({ x: 0, y: 0, w: PAGE_WIDTH, h: 88, fill: COLORS.headerBg });

    page.text({
      text: "TradeMiles | Relatorio Mensal de Comissoes",
      x: MARGIN,
      y: 32,
      font: "F2",
      size: 16,
      color: COLORS.headerText,
    });

    page.text({
      text: `${input.employeeName} (@${input.login})`,
      x: MARGIN,
      y: 54,
      font: "F1",
      size: 10,
      color: COLORS.headerText,
    });

    page.text({
      text: `Mes ${input.month}`,
      x: MARGIN,
      y: 70,
      font: "F1",
      size: 10,
      color: COLORS.headerText,
    });

    page.text({
      text: `Gerado em ${input.generatedAt}`,
      x: PAGE_WIDTH - MARGIN - 210,
      y: 70,
      width: 210,
      align: "right",
      font: "F1",
      size: 9,
      color: COLORS.headerText,
    });
  } else {
    page.rect({ x: 0, y: 0, w: PAGE_WIDTH, h: 62, fill: COLORS.headerBg });

    page.text({
      text: "Relatorio Mensal de Comissoes",
      x: MARGIN,
      y: 30,
      font: "F2",
      size: 13,
      color: COLORS.headerText,
    });

    page.text({
      text: `${input.employeeName} (@${input.login}) | ${input.month}`,
      x: MARGIN,
      y: 48,
      font: "F1",
      size: 9,
      color: COLORS.headerText,
    });

    page.text({
      text: `Pag ${input.pageNumber}`,
      x: PAGE_WIDTH - MARGIN - 70,
      y: 48,
      width: 70,
      align: "right",
      font: "F1",
      size: 9,
      color: COLORS.headerText,
    });
  }
}

function drawSummaryBoxes(
  page: PdfCanvas,
  input: {
    stats: StatsSummary;
    totals: CurrencySummary;
  }
) {
  const top = 106;
  const gap = 12;
  const boxW = (PAGE_WIDTH - MARGIN * 2 - gap) / 2;
  const boxH = 176;

  const leftX = MARGIN;
  const rightX = leftX + boxW + gap;

  page.rect({
    x: leftX,
    y: top,
    w: boxW,
    h: boxH,
    fill: COLORS.cardBg,
    stroke: COLORS.border,
  });

  page.rect({
    x: rightX,
    y: top,
    w: boxW,
    h: boxH,
    fill: COLORS.cardBg,
    stroke: COLORS.border,
  });

  page.text({
    text: "Estatisticas",
    x: leftX + 12,
    y: top + 22,
    font: "F2",
    size: 11,
  });

  const statLines = [
    ["Dias com comissao", String(input.stats.gainDaysCount)],
    ["Media por dia", fmtMoneyBR(input.stats.avgGainCents)],
    ["Desvio padrao", fmtMoneyBR(input.stats.stdDevGainCents)],
    ["Dia de maior ganho", input.stats.bestDayLabel],
    ["Valor do melhor dia", input.stats.bestDayValue],
  ] as const;

  let y = top + 46;
  statLines.forEach(([label, value]) => {
    page.text({ text: label, x: leftX + 12, y, size: 9, color: COLORS.muted });
    page.text({
      text: value,
      x: leftX + 12,
      y,
      width: boxW - 24,
      align: "right",
      font: "F2",
      size: 10,
      color: COLORS.bodyText,
    });
    y += 24;
  });

  page.text({
    text: "Totais do mes",
    x: rightX + 12,
    y: top + 22,
    font: "F2",
    size: 11,
  });

  const totalLines = [
    { label: "Comissao 1 (1%)", value: fmtMoneyBR(input.totals.totalC1), isStrong: false, highlight: false },
    { label: "Comissao 2 (bonus)", value: fmtMoneyBR(input.totals.totalC2), isStrong: false, highlight: false },
    { label: "Comissao 3 (rateio)", value: fmtMoneyBR(input.totals.totalC3), isStrong: false, highlight: false },
    { label: "Reembolso taxa", value: fmtMoneyBR(input.totals.totalFee), isStrong: false, highlight: false },
    { label: "Impostos pagos", value: fmtMoneyBR(input.totals.totalTax), isStrong: false, highlight: false },
    { label: "Bruto", value: fmtMoneyBR(input.totals.totalGross), isStrong: false, highlight: false },
    { label: "Ganho mensal", value: fmtMoneyBR(input.totals.totalLucroSemTaxa), isStrong: true, highlight: true },
  ];

  y = top + 42;
  totalLines.forEach((line) => {
    if (line.highlight) {
      page.rect({
        x: rightX + 8,
        y: y - 11,
        w: boxW - 16,
        h: 17,
        fill: COLORS.tableHeaderBg,
      });
    }

    page.text({
      text: line.label,
      x: rightX + 12,
      y,
      size: 9,
      color: line.isStrong ? COLORS.bodyText : COLORS.muted,
      font: line.isStrong ? "F2" : "F1",
    });

    page.text({
      text: line.value,
      x: rightX + 12,
      y,
      width: boxW - 24,
      align: "right",
      font: "F2",
      size: 10,
    });

    y += 20;
  });
}

function drawTableHeader(page: PdfCanvas, top: number) {
  page.rect({
    x: MARGIN,
    y: top,
    w: PAGE_WIDTH - MARGIN * 2,
    h: TABLE_HEADER_HEIGHT,
    fill: COLORS.tableHeaderBg,
    stroke: COLORS.border,
  });

  let x = MARGIN;
  TABLE_COLUMNS.forEach((col) => {
    page.text({
      text: col.title,
      x: x + 6,
      y: top + 16,
      width: col.width - 12,
      align: col.align === "left" ? "left" : col.align,
      font: "F2",
      size: 9,
    });

    x += col.width;
  });
}

function drawTableRow(page: PdfCanvas, row: TableRow, top: number, index: number) {
  if (index % 2 === 1) {
    page.rect({
      x: MARGIN,
      y: top,
      w: PAGE_WIDTH - MARGIN * 2,
      h: TABLE_ROW_HEIGHT,
      fill: COLORS.rowAltBg,
    });
  }

  page.line({
    x1: MARGIN,
    y1: top + TABLE_ROW_HEIGHT,
    x2: PAGE_WIDTH - MARGIN,
    y2: top + TABLE_ROW_HEIGHT,
    stroke: COLORS.border,
    lineWidth: 0.8,
  });

  let x = MARGIN;
  TABLE_COLUMNS.forEach((col) => {
    const text = row[col.key];
    const baseColor =
      col.key === "variation"
        ? row.variation === "^"
          ? COLORS.green
          : row.variation === "v"
          ? COLORS.red
          : COLORS.bodyText
        : COLORS.bodyText;

    page.text({
      text,
      x: x + 6,
      y: top + 14,
      width: col.width - 12,
      align: col.align,
      size: 9,
      font: col.key === "variation" ? "F2" : "F1",
      color: baseColor,
    });

    x += col.width;
  });
}

function drawFooter(page: PdfCanvas, pageNumber: number) {
  const footerTop = PAGE_HEIGHT - 36;

  page.line({
    x1: MARGIN,
    y1: footerTop,
    x2: PAGE_WIDTH - MARGIN,
    y2: footerTop,
    stroke: COLORS.border,
  });

  page.text({
    text: "TradeMiles | Relatorio mensal de comissoes",
    x: MARGIN,
    y: footerTop + 16,
    size: 8,
    color: COLORS.muted,
  });

  page.text({
    text: `Pagina ${pageNumber}`,
    x: PAGE_WIDTH - MARGIN - 80,
    y: footerTop + 16,
    width: 80,
    align: "right",
    size: 8,
    color: COLORS.muted,
  });
}

function renderReportToPages(input: {
  employeeName: string;
  login: string;
  month: string;
  generatedAt: string;
  stats: StatsSummary;
  totals: CurrencySummary;
  rows: TableRow[];
}) {
  const pages: string[] = [];
  let pageNumber = 1;
  let rowIndex = 0;

  let canvas = new PdfCanvas();
  drawHeader(canvas, {
    isFirstPage: true,
    pageNumber,
    employeeName: input.employeeName,
    login: input.login,
    month: input.month,
    generatedAt: input.generatedAt,
  });

  drawSummaryBoxes(canvas, { stats: input.stats, totals: input.totals });

  canvas.text({
    text: "Detalhamento diario (somente dias com comissoes > 0)",
    x: MARGIN,
    y: TABLE_TOP_FIRST_PAGE - 14,
    font: "F2",
    size: 10,
  });

  drawTableHeader(canvas, TABLE_TOP_FIRST_PAGE);
  let tableY = TABLE_TOP_FIRST_PAGE + TABLE_HEADER_HEIGHT;

  while (rowIndex < input.rows.length) {
    if (tableY + TABLE_ROW_HEIGHT > TABLE_BOTTOM_LIMIT) {
      drawFooter(canvas, pageNumber);
      pages.push(canvas.build());

      pageNumber += 1;
      canvas = new PdfCanvas();
      drawHeader(canvas, {
        isFirstPage: false,
        pageNumber,
        employeeName: input.employeeName,
        login: input.login,
        month: input.month,
        generatedAt: input.generatedAt,
      });
      drawTableHeader(canvas, TABLE_TOP_NEXT_PAGE);
      tableY = TABLE_TOP_NEXT_PAGE + TABLE_HEADER_HEIGHT;
    }

    drawTableRow(canvas, input.rows[rowIndex], tableY, rowIndex);
    tableY += TABLE_ROW_HEIGHT;
    rowIndex += 1;
  }

  if (!input.rows.length) {
    canvas.rect({
      x: MARGIN,
      y: tableY,
      w: PAGE_WIDTH - MARGIN * 2,
      h: TABLE_ROW_HEIGHT,
      fill: COLORS.rowAltBg,
      stroke: COLORS.border,
    });

    canvas.text({
      text: "Sem dias com comissoes neste mes.",
      x: MARGIN + 10,
      y: tableY + 14,
      size: 9,
      color: COLORS.muted,
    });

    tableY += TABLE_ROW_HEIGHT;
  }

  const legendY = Math.min(tableY + 16, PAGE_HEIGHT - 48);
  canvas.text({
    text: "Legenda var: ^ maior que dia anterior | v menor | = igual | - primeiro dia. Lucro s/taxa = Bruto - Imposto.",
    x: MARGIN,
    y: legendY,
    size: 8,
    color: COLORS.muted,
  });

  drawFooter(canvas, pageNumber);
  pages.push(canvas.build());

  return pages;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = String(session?.team || "").trim();

    if (!team) {
      return NextResponse.json({ ok: false, error: "Nao autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = String(searchParams.get("userId") || "").trim();
    const month = String(searchParams.get("month") || "").trim().slice(0, 7);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId obrigatorio." }, { status: 400 });
    }

    if (!isMonthISO(month)) {
      return NextResponse.json(
        { ok: false, error: "month invalido. Use YYYY-MM." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, team },
      select: { id: true, name: true, login: true },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Funcionario nao encontrado." },
        { status: 404 }
      );
    }

    const payouts = await prisma.employeePayout.findMany({
      where: {
        team,
        userId,
        date: { startsWith: `${month}-` },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        grossProfitCents: true,
        tax7Cents: true,
        feeCents: true,
        breakdown: true,
      },
    });

    const days: DayReport[] = payouts
      .map((p) => {
        const b = parseBreakdown(p.breakdown);
        const grossCents = safeInt(p.grossProfitCents, 0);
        const taxCents = safeInt(p.tax7Cents, 0);
        const feeCents = safeInt(p.feeCents, 0);
        const lucroSemTaxaCents = grossCents - taxCents;

        return {
          date: p.date,
          grossCents,
          taxCents,
          feeCents,
          lucroSemTaxaCents,
          c1Cents: b.c1Cents,
          c2Cents: b.c2Cents,
          c3Cents: b.c3Cents,
          salesCount: b.salesCount,
        };
      })
      .filter((d) => d.grossCents > 0);

    const totals = computeCurrencySummary(days);
    const stats = computeStats(days);
    const rows = buildTableRows(days);

    const pages = renderReportToPages({
      employeeName: user.name || user.login,
      login: user.login,
      month,
      generatedAt: fmtNowBR(),
      stats,
      totals,
      rows,
    });

    const pdf = buildPdf(pages);
    const safeLogin = toAscii(user.login || "funcionario").replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `comissoes-${safeLogin}-${month}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao gerar PDF.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: message === "UNAUTHENTICATED" ? "Nao autenticado." : message },
      { status }
    );
  }
}
