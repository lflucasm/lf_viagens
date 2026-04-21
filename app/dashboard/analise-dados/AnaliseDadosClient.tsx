"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download } from "lucide-react";

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtMoneyCompactBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function fmtPct(p: number) {
  const v = (p || 0) * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
function fmtPctRaw(v: number) {
  return `${(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}
function fmtPctSigned(v: number) {
  const n = Number(v || 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function daysInMonthFromKey(monthKey?: string | null) {
  const raw = String(monthKey || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return 30;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return 30;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function elapsedDaysInMonthFromKey(monthKey?: string | null, todayISO?: string | null) {
  const key = String(monthKey || "").trim();
  const totalDays = daysInMonthFromKey(key);
  const todayRaw = String(todayISO || "").trim();
  const todayMatch = todayRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!todayMatch || !/^\d{4}-\d{2}$/.test(key)) return totalDays;

  const todayKey = `${todayMatch[1]}-${todayMatch[2]}`;
  if (key < todayKey) return totalDays;
  if (key > todayKey) return 0;

  const day = Number(todayMatch[3]);
  if (!Number.isFinite(day)) return totalDays;
  return Math.max(1, Math.min(totalDays, day));
}

function monthLabelLongPT(monthKey?: string | null) {
  const raw = String(monthKey || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return raw || "—";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function dayLabelLongPT(dayKey?: string | null) {
  const raw = String(dayKey || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw || "—";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

type Analytics = any;

type ChartMode = "MONTH" | "DAY";
type DaysPreset = 7 | 15 | 30 | "CUSTOM";
type MAWindow = 0 | 7 | 15 | 30;
type SalesDailyHistoryRange = 30 | 60 | 90 | 120 | 180 | 365 | "ALL";

function salesDailyRangeLabel(range: SalesDailyHistoryRange) {
  if (range === "ALL") return "Todo período";
  if (range === 365) return "1 ano";
  return `${fmtInt(Number(range))} dias`;
}

type ChartPoint = { x: string; y: number };
type ChartPointWithSub = ChartPoint & { sub?: string };
type MilheiroPoint = {
  key: string;
  x: string;
  latam: number;
  smiles: number;
  subLatam?: string;
  subSmiles?: string;
};

type CardTone = "sky" | "emerald" | "amber" | "rose" | "slate" | "teal";

const CARD_TONE_CLASS: Record<CardTone, string> = {
  sky: "border-sky-100 bg-gradient-to-br from-sky-50/80 to-white",
  emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white",
  amber: "border-amber-100 bg-gradient-to-br from-amber-50/80 to-white",
  rose: "border-rose-100 bg-gradient-to-br from-rose-50/80 to-white",
  teal: "border-teal-100 bg-gradient-to-br from-teal-50/80 to-white",
  slate: "border-slate-200 bg-white",
};

const CHART_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#e11d48",
  "#06b6d4",
  "#84cc16",
  "#14b8a6",
  "#3b82f6",
  "#64748b",
];

// Histórico legado (planilhas, antes da adoção completa do sistema).
// Valores em centavos para somar no gráfico mensal de vendas totais.
const LEGACY_MONTHLY_SALES_CENTS: Record<string, number> = {
  "2025-01": 10725068, // jan/25
  "2025-02": 21868580, // fev/25
  "2025-03": 18793356, // mar/25
  "2025-04": 18580911, // abr/25
  "2025-05": 32062719, // mai/25
  "2025-06": 19673470, // jun/25
  "2025-07": 31298648, // jul/25
  "2025-08": 30523430, // ago/25
  "2025-09": 26890103, // set/25
  "2025-10": 24495860, // out/25
  "2025-11": 37839903, // nov/25
  "2025-12": 24039846, // dez/25
  "2026-01": 7547272, // jan/26 (parcial antigo) -> soma ao que já existe no TradeMiles
};

// Histórico legado de lucro mensal (2025), em centavos.
const LEGACY_MONTHLY_PROFIT_CENTS: Record<string, number> = {
  "2025-01": 533075, // jan/25
  "2025-02": 1245457, // fev/25
  "2025-03": 1180895, // mar/25
  "2025-04": 896038, // abr/25
  "2025-05": 1983573, // mai/25
  "2025-06": 946926, // jun/25
  "2025-08": 1546795, // ago/25
  "2025-09": 1510788, // set/25
  "2025-10": 1122731, // out/25
  "2025-11": 2251929, // nov/25
  "2025-12": 1455849, // dez/25
};

function Card({
  title,
  value,
  sub,
  tone = "slate",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: CardTone;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${CARD_TONE_CLASS[tone]}`}>
      <div className="text-xs text-neutral-600">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

// ======= charts simples (sem libs) =======
function SimpleLineChart({
  title,
  data,
  height = 190,
  extraLine,
  trendLine,
  summary,
  footer,
  accent = "text-slate-900",
  valueLabel = "Valor",
}: {
  title: string;
  data: ChartPointWithSub[];
  height?: number;
  extraLine?: ChartPoint[];
  trendLine?: ChartPoint[];
  summary?: ReactNode;
  footer?: ReactNode;
  accent?: string;
  valueLabel?: string;
}) {
  const w = 980;
  const h = height;
  const leftPad = 20;
  const rightPad = 70;
  const topPad = 14;
  const bottomPad = 22;
  const plotW = w - leftPad - rightPad;
  const plotH = h - topPad - bottomPad;
  const baseY = topPad + plotH;

  const ysBase = data.map((d) => d.y);
  const ysExtra = (extraLine || []).map((d) => d.y);
  const ysTrend = (trendLine || []).map((d) => d.y);
  const ysAll = [...ysBase, ...ysExtra, ...ysTrend];

  const ymin = Math.min(...ysAll, 0);
  const ymax = Math.max(...ysAll, 1);

  const dx = data.length <= 1 ? 0 : plotW / (data.length - 1);
  const scaleY = (v: number) => {
    const t = (v - ymin) / (ymax - ymin || 1);
    return topPad + plotH - t * plotH;
  };

  const pointsBase = data.map((d, i) => `${leftPad + i * dx},${scaleY(d.y)}`).join(" ");
  const pointsExtra = extraLine
    ? extraLine.map((d, i) => `${leftPad + i * dx},${scaleY(d.y)}`).join(" ")
    : "";
  const pointsTrend = trendLine
    ? trendLine.map((d, i) => `${leftPad + i * dx},${scaleY(d.y)}`).join(" ")
    : "";

  const areaPath = data.length
    ? [
        `M ${leftPad} ${baseY}`,
        ...data.map((d, i) => `L ${leftPad + i * dx} ${scaleY(d.y)}`),
        `L ${leftPad + (data.length - 1) * dx} ${baseY}`,
        "Z",
      ].join(" ")
    : "";

  const yTicks = [ymax, (ymax + ymin) / 2, ymin];
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const hitW = data.length <= 1 ? plotW : Math.max(10, plotW / data.length);
  const hovered = hoveredIdx != null ? data[hoveredIdx] : null;
  const hoverX = hoveredIdx != null ? leftPad + hoveredIdx * dx : leftPad;
  const tipW = 230;
  const tipH = hovered?.sub ? 68 : 52;
  const tipX = Math.max(leftPad, Math.min(hoverX - tipW / 2, leftPad + plotW - tipW));
  const tipY = topPad + 8;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      {summary ? <div className="mb-3">{summary}</div> : null}
      <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          Série principal
        </span>
        {extraLine?.length ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            <span className="h-2 w-2 rounded-full bg-neutral-400" />
            Média móvel
          </span>
        ) : null}
        {trendLine?.length ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            <span className="h-0 w-3 border-t border-dashed border-indigo-400" />
            Tendência
          </span>
        ) : null}
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" onMouseLeave={() => setHoveredIdx(null)}>
        {/* grade horizontal */}
        {yTicks.map((v, i) => (
          <line
            key={`grid-${i}`}
            x1={leftPad}
            x2={leftPad + plotW}
            y1={scaleY(v)}
            y2={scaleY(v)}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* labels Y */}
        {yTicks.map((v, i) => (
          <text
            key={`ylabel-${i}`}
            x={leftPad + plotW + 6}
            y={scaleY(v) + 3}
            fontSize="10"
            fill="#64748b"
          >
            {fmtMoneyCompactBR(Math.round(v))}
          </text>
        ))}

        {/* área */}
        {areaPath ? <path d={areaPath} fill="#0ea5e91A" /> : null}

        {/* linha principal */}
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          points={pointsBase}
          className={accent}
        />
        {data.map((d, i) => (
          <circle
            key={`${d.x}-${i}`}
            cx={leftPad + i * dx}
            cy={scaleY(d.y)}
            r="2.5"
            className={accent}
          >
            <title>{`${d.x} • ${valueLabel}: ${fmtMoneyBR(d.y)}`}</title>
          </circle>
        ))}

        {data.map((d, i) => {
          const x = leftPad + i * dx - hitW / 2;
          return (
            <rect
              key={`${d.x}-${i}-hit`}
              x={x}
              y={topPad}
              width={hitW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
            />
          );
        })}

        {/* linha extra (média móvel) */}
        {extraLine?.length ? (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            points={pointsExtra}
            className="text-neutral-400"
          />
        ) : null}

        {/* linha de tendência */}
        {trendLine?.length ? (
          <polyline
            fill="none"
            stroke="#818cf8"
            strokeWidth="1.8"
            strokeDasharray="5 4"
            points={pointsTrend}
          />
        ) : null}

        {hovered ? (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={topPad}
              y2={baseY}
              stroke="#cbd5e1"
              strokeDasharray="4 3"
              strokeWidth="1"
            />
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="8" fill="white" stroke="#cbd5e1" />
            <text x={tipX + 10} y={tipY + 17} fontSize="10" fill="#334155">
              {hovered.x}
            </text>
            <text x={tipX + 10} y={tipY + 34} fontSize="11" fill="#0f172a">
              {`${valueLabel}: ${fmtMoneyBR(hovered.y)}`}
            </text>
            {hovered.sub ? (
              <text x={tipX + 10} y={tipY + 51} fontSize="10" fill="#475569">
                {hovered.sub}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>

      {/* detalhes */}
      {data.length ? (
        <details className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-2">
          <summary className="cursor-pointer text-xs font-medium text-neutral-700">
            Ver detalhes por ponto ({data.length})
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.map((d) => {
              const subClass = d.sub
                ? d.sub.includes("+")
                  ? "text-emerald-700"
                  : d.sub.includes("-")
                    ? "text-rose-700"
                    : "text-neutral-500"
                : "text-neutral-500";
              return (
                <div key={d.x} className="rounded-xl border bg-white px-2 py-1 text-[11px]">
                  <div className="text-neutral-600">{d.x}</div>
                  <div className="font-medium">{fmtMoneyBR(d.y)}</div>
                  {d.sub ? <div className={`text-[10px] ${subClass}`}>{d.sub}</div> : null}
                </div>
              );
            })}
          </div>
        </details>
      ) : (
        <div className="mt-2 text-xs text-neutral-500">Sem dados no período selecionado.</div>
      )}

      {footer ? <div className="mt-3 text-xs text-neutral-600">{footer}</div> : null}
    </div>
  );
}

function MilheiroLineChart({
  title,
  data,
  height = 210,
  footer,
  toolbar,
}: {
  title: string;
  data: MilheiroPoint[];
  height?: number;
  footer?: ReactNode;
  toolbar?: ReactNode;
}) {
  const w = 980;
  const h = height;
  const leftPad = 20;
  const rightPad = 70;
  const topPad = 14;
  const bottomPad = 22;
  const plotW = w - leftPad - rightPad;
  const plotH = h - topPad - bottomPad;
  const baseY = topPad + plotH;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const ys = data.flatMap((d) => [d.latam, d.smiles]);
  const ymin = Math.min(...ys, 0);
  const ymax = Math.max(...ys, 1);
  const dx = data.length <= 1 ? 0 : plotW / (data.length - 1);
  const scaleY = (v: number) => {
    const t = (v - ymin) / (ymax - ymin || 1);
    return topPad + plotH - t * plotH;
  };

  const latamPoints = data.map((d, i) => `${leftPad + i * dx},${scaleY(d.latam)}`).join(" ");
  const smilesPoints = data.map((d, i) => `${leftPad + i * dx},${scaleY(d.smiles)}`).join(" ");
  const yTicks = [ymax, (ymax + ymin) / 2, ymin];
  const hitW = data.length <= 1 ? plotW : Math.max(10, plotW / data.length);
  const hovered = hoveredIdx != null ? data[hoveredIdx] : null;
  const hoverX = hoveredIdx != null ? leftPad + hoveredIdx * dx : leftPad;
  const hoverAvg = hovered
    ? (() => {
        const vals = [hovered.latam, hovered.smiles].filter((v) => v > 0);
        if (!vals.length) return 0;
        return Math.round(vals.reduce((acc, v) => acc + v, 0) / vals.length);
      })()
    : 0;
  const tipW = 220;
  const tipH = 68;
  const tipX = Math.max(leftPad, Math.min(hoverX - tipW / 2, leftPad + plotW - tipW));
  const tipY = topPad + 8;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {toolbar ? <div>{toolbar}</div> : null}
      </div>
      <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          LATAM
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Smiles
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" onMouseLeave={() => setHoveredIdx(null)}>
        {yTicks.map((v, i) => (
          <line
            key={`grid-${i}`}
            x1={leftPad}
            x2={leftPad + plotW}
            y1={scaleY(v)}
            y2={scaleY(v)}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {yTicks.map((v, i) => (
          <text
            key={`ylabel-${i}`}
            x={leftPad + plotW + 6}
            y={scaleY(v) + 3}
            fontSize="10"
            fill="#64748b"
          >
            {fmtMoneyCompactBR(Math.round(v))}
          </text>
        ))}

        <line x1={leftPad} x2={leftPad + plotW} y1={baseY} y2={baseY} stroke="#e5e7eb" strokeWidth="1" />

        <polyline fill="none" stroke="#0ea5e9" strokeWidth="2.2" points={latamPoints} />
        <polyline fill="none" stroke="#10b981" strokeWidth="2.2" points={smilesPoints} />

        {data.map((d, i) => (
          <circle key={`${d.key}-latam`} cx={leftPad + i * dx} cy={scaleY(d.latam)} r="2.5" fill="#0ea5e9">
            <title>{`${d.x} • LATAM: ${fmtMoneyBR(d.latam)}`}</title>
          </circle>
        ))}
        {data.map((d, i) => (
          <circle key={`${d.key}-smiles`} cx={leftPad + i * dx} cy={scaleY(d.smiles)} r="2.5" fill="#10b981">
            <title>{`${d.x} • Smiles: ${fmtMoneyBR(d.smiles)}`}</title>
          </circle>
        ))}

        {data.map((d, i) => {
          const x = leftPad + i * dx - hitW / 2;
          return (
            <rect
              key={`${d.key}-hit`}
              x={x}
              y={topPad}
              width={hitW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
            />
          );
        })}

        {hovered ? (
          <>
            <line x1={hoverX} x2={hoverX} y1={topPad} y2={baseY} stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1" />
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="8" fill="white" stroke="#cbd5e1" />
            <text x={tipX + 10} y={tipY + 17} fontSize="10" fill="#334155">
              {hovered.x}
            </text>
            <text x={tipX + 10} y={tipY + 34} fontSize="11" fill="#0c4a6e">
              {`LATAM: ${fmtMoneyBR(hovered.latam)} • Smiles: ${fmtMoneyBR(hovered.smiles)}`}
            </text>
            <text x={tipX + 10} y={tipY + 51} fontSize="11" fill="#0f766e">
              {`Média milheiro: ${fmtMoneyBR(hoverAvg)}`}
            </text>
          </>
        ) : null}
      </svg>

      {data.length ? (
        <details className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-2">
          <summary className="cursor-pointer text-xs font-medium text-neutral-700">
            Ver detalhes por dia ({data.length})
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.map((d) => (
              <div key={d.key} className="rounded-xl border bg-white px-2 py-1 text-[11px]">
                <div className="text-neutral-600">{d.x}</div>
                <div className="mt-0.5">
                  <span className="font-medium text-sky-700">LATAM:</span> {fmtMoneyBR(d.latam)}
                </div>
                {d.subLatam ? <div className="text-[10px] text-neutral-500">{d.subLatam}</div> : null}
                <div className="mt-0.5">
                  <span className="font-medium text-emerald-700">Smiles:</span> {fmtMoneyBR(d.smiles)}
                </div>
                {d.subSmiles ? <div className="text-[10px] text-neutral-500">{d.subSmiles}</div> : null}
              </div>
            ))}
          </div>
        </details>
      ) : (
        <div className="mt-2 text-xs text-neutral-500">Sem dados no período selecionado.</div>
      )}

      {footer ? <div className="mt-3 text-xs text-neutral-600">{footer}</div> : null}
    </div>
  );
}

function MilheiroMonthlyBarChart({
  title,
  data,
  height = 240,
  footer,
}: {
  title: string;
  data: MilheiroPoint[];
  height?: number;
  footer?: ReactNode;
}) {
  const w = 980;
  const h = height;
  const leftPad = 24;
  const rightPad = 70;
  const topPad = 14;
  const bottomPad = 40;
  const plotW = w - leftPad - rightPad;
  const plotH = h - topPad - bottomPad;
  const baseY = topPad + plotH;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxV = Math.max(1, ...data.flatMap((d) => [d.latam, d.smiles]));
  const groupW = data.length ? plotW / data.length : plotW;
  const barW = Math.max(6, Math.min(18, groupW * 0.28));
  const labelStep = data.length > 12 ? Math.ceil(data.length / 12) : 1;

  const scaleY = (v: number) => topPad + plotH - (v / maxV) * plotH;
  const yTicks = [maxV, maxV / 2, 0];
  const hovered = hoveredIdx != null ? data[hoveredIdx] : null;
  const hoverAvg = hovered
    ? (() => {
        const vals = [hovered.latam, hovered.smiles].filter((v) => v > 0);
        if (!vals.length) return 0;
        return Math.round(vals.reduce((acc, v) => acc + v, 0) / vals.length);
      })()
    : 0;
  const hoverX = hoveredIdx != null ? leftPad + hoveredIdx * groupW + groupW / 2 : leftPad;
  const tipW = 220;
  const tipH = 68;
  const tipX = Math.max(leftPad, Math.min(hoverX - tipW / 2, leftPad + plotW - tipW));
  const tipY = topPad + 8;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          LATAM
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Smiles
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" onMouseLeave={() => setHoveredIdx(null)}>
        {yTicks.map((v, i) => (
          <line
            key={`grid-${i}`}
            x1={leftPad}
            x2={leftPad + plotW}
            y1={scaleY(v)}
            y2={scaleY(v)}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}
        {yTicks.map((v, i) => (
          <text
            key={`ylabel-${i}`}
            x={leftPad + plotW + 6}
            y={scaleY(v) + 3}
            fontSize="10"
            fill="#64748b"
          >
            {fmtMoneyCompactBR(Math.round(v))}
          </text>
        ))}

        {data.map((d, i) => {
          const gx = leftPad + i * groupW + groupW / 2;
          const groupX = leftPad + i * groupW;
          const hLatam = (d.latam / maxV) * plotH;
          const hSmiles = (d.smiles / maxV) * plotH;
          const xLatam = gx - barW - 2;
          const xSmiles = gx + 2;
          const yLatam = baseY - hLatam;
          const ySmiles = baseY - hSmiles;
          return (
            <g key={d.key}>
              <rect x={xLatam} y={yLatam} width={barW} height={Math.max(1, hLatam)} rx="2" fill="#0ea5e9">
                <title>{`${d.x} • LATAM: ${fmtMoneyBR(d.latam)}`}</title>
              </rect>
              <rect x={xSmiles} y={ySmiles} width={barW} height={Math.max(1, hSmiles)} rx="2" fill="#10b981">
                <title>{`${d.x} • Smiles: ${fmtMoneyBR(d.smiles)}`}</title>
              </rect>
              <rect
                x={groupX}
                y={topPad}
                width={groupW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(i)}
              />
              {i % labelStep === 0 || i === data.length - 1 ? (
                <text x={gx} y={h - 10} textAnchor="middle" fontSize="10" fill="#64748b">
                  {d.x}
                </text>
              ) : null}
            </g>
          );
        })}

        {hovered ? (
          <>
            <line x1={hoverX} x2={hoverX} y1={topPad} y2={baseY} stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1" />
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="8" fill="white" stroke="#cbd5e1" />
            <text x={tipX + 10} y={tipY + 17} fontSize="10" fill="#334155">
              {hovered.x}
            </text>
            <text x={tipX + 10} y={tipY + 34} fontSize="11" fill="#0c4a6e">
              {`LATAM: ${fmtMoneyBR(hovered.latam)} • Smiles: ${fmtMoneyBR(hovered.smiles)}`}
            </text>
            <text x={tipX + 10} y={tipY + 51} fontSize="11" fill="#0f766e">
              {`Média milheiro: ${fmtMoneyBR(hoverAvg)}`}
            </text>
          </>
        ) : null}
      </svg>

      {data.length ? (
        <details className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-2">
          <summary className="cursor-pointer text-xs font-medium text-neutral-700">
            Ver detalhes por mês ({data.length})
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.map((d) => (
              <div key={d.key} className="rounded-xl border bg-white px-2 py-1 text-[11px]">
                <div className="text-neutral-600">{d.x}</div>
                <div>
                  <span className="font-medium text-sky-700">LATAM:</span> {fmtMoneyBR(d.latam)}
                </div>
                {d.subLatam ? <div className="text-[10px] text-neutral-500">{d.subLatam}</div> : null}
                <div>
                  <span className="font-medium text-emerald-700">Smiles:</span> {fmtMoneyBR(d.smiles)}
                </div>
                {d.subSmiles ? <div className="text-[10px] text-neutral-500">{d.subSmiles}</div> : null}
              </div>
            ))}
          </div>
        </details>
      ) : (
        <div className="mt-2 text-xs text-neutral-500">Sem dados no período selecionado.</div>
      )}

      {footer ? <div className="mt-3 text-xs text-neutral-600">{footer}</div> : null}
    </div>
  );
}

function SimpleBarChart({ title, data }: { title: string; data: Array<{ label: string; value: number; pct?: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {data.map((d, i) => {
          const w = Math.round((d.value / max) * 100);
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div className="w-10 text-xs text-neutral-600">{d.label}</div>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-neutral-100">
                  <div className="h-3 rounded-full" style={{ width: `${w}%`, background: color }} />
                </div>
              </div>
              <div className="w-32 text-right text-xs text-neutral-700">
                {fmtMoneyBR(d.value)} {typeof d.pct === "number" ? `(${Math.round(d.pct * 100)}%)` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SimplePieChart({
  title,
  data,
  totalLabel,
}: {
  title: string;
  data: Array<{ label: string; value: number; pct: number; color: string }>;
  totalLabel?: string;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const radius = 15.915;
  const finalSegments = data.reduce<
    Array<{ key: string; color: string; dash: string; dashOffset: number; accPct100: number }>
  >((acc, s, i) => {
    const prevAcc = i === 0 ? 0 : acc[i - 1].accPct100;
    const pct100 = Math.max(0, Math.min(100, s.pct * 100));
    const dash = `${pct100} ${100 - pct100}`;
    const dashOffset = 25 - prevAcc;
    return [
      ...acc,
      {
        key: `${s.label}-${i}`,
        color: s.color,
        dash,
        dashOffset,
        accPct100: prevAcc + pct100,
      },
    ];
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{title}</div>

      {!data.length || total <= 0 ? (
        <div className="text-sm text-neutral-500">Sem dados suficientes para o gráfico.</div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-40 w-40">
              <circle cx="18" cy="18" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
              {finalSegments.map((s) => (
                <circle
                  key={s.key}
                  cx="18"
                  cy="18"
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="6"
                  strokeDasharray={s.dash}
                  strokeDashoffset={s.dashOffset}
                />
              ))}
            </svg>
          </div>

          <div className="flex-1 space-y-2">
            {data.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="text-neutral-500">{(s.pct * 100).toFixed(1)}%</span>
                <span className="font-medium">{fmtMoneyBR(s.value)}</span>
              </div>
            ))}
            {totalLabel ? (
              <div className="pt-2 text-xs text-neutral-500">{totalLabel}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function movingAverage(values: number[], windowSize: number) {
  if (!windowSize || windowSize <= 1) return values.slice();
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / slice.length);
  });
}

function buildTrendLine(points: ChartPoint[]): ChartPoint[] | undefined {
  if (points.length < 2) return undefined;

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  points.forEach((p, i) => {
    sumX += i;
    sumY += p.y;
    sumXY += i * p.y;
    sumXX += i * i;
  });

  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return points.map((p, i) => ({ x: p.x, y: Math.round(intercept + slope * i) }));
}

export default function AnaliseDadosClient() {
  const [monthsBack, setMonthsBack] = useState<number>(12);
  const [focusYM, setFocusYM] = useState<string>(""); // YYYY-MM
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);

  const [topPeriod, setTopPeriod] = useState<"MONTH" | "TOTAL">("MONTH");
  const [topProgram, setTopProgram] = useState<"ALL" | "LATAM" | "SMILES">("ALL");

  // ✅ modo do gráfico
  const [chartMode, setChartMode] = useState<ChartMode>("MONTH");

  // ✅ range diário
  const [daysPreset, setDaysPreset] = useState<DaysPreset>(30);
  const [daysBack, setDaysBack] = useState<number>(30);
  const [milheiroDaysBack, setMilheiroDaysBack] = useState<number>(30);
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD

  // ✅ média móvel (linha cinza)
  const [maWindow, setMaWindow] = useState<MAWindow>(0);
  const [salesDailyHistoryRange, setSalesDailyHistoryRange] =
    useState<SalesDailyHistoryRange>(30);

  useEffect(() => {
    if (daysPreset !== "CUSTOM") setDaysBack(daysPreset);
  }, [daysPreset]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("monthsBack", String(monthsBack));
      if (focusYM) qs.set("month", focusYM);

      // top clientes
      qs.set("topMode", topPeriod);
      qs.set("topProgram", topProgram);
      qs.set("topLimit", "10");

      // gráfico
      qs.set("chart", chartMode);
      if (chartMode === "DAY") {
        if (daysPreset === "CUSTOM") {
          if (dateFrom) qs.set("from", dateFrom);
          if (dateTo) qs.set("to", dateTo);
        } else {
          qs.set("daysBack", String(daysBack));
        }
        if (maWindow) qs.set("ma", String(maWindow));
      }
      qs.set("milheiroDaysBack", String(milheiroDaysBack));

      const res = await fetch(`/api/analytics?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json();
      setData(j);

      if (!focusYM && j?.filters?.month) setFocusYM(j.filters.month);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack, focusYM, topPeriod, topProgram, chartMode, daysPreset, daysBack, dateFrom, dateTo, maWindow, milheiroDaysBack]);

  const monthOptions = useMemo<string[]>(() => {
    const arr = (data?.months || []) as any[];
    return [...arr].map((m) => String(m.key)).reverse();
  }, [data]);

  const kpis = useMemo(() => {
    if (!data?.summary) return null;

    const gross = Number(data.summary.grossCents || 0);
    const pax = Number(data.summary.passengers || 0);
    const count = Number(data.summary.salesCount || 0);

    const monthRow = (data.months || []).find((m: any) => m.key === (data.filters?.month || focusYM));
    const latam = Number(monthRow?.byProgram?.LATAM || 0);
    const smiles = Number(monthRow?.byProgram?.SMILES || 0);

    const clubRow = (data.clubsByMonth || []).find((c: any) => c.key === (data.filters?.month || focusYM));
    const clubsLatam = Number(clubRow?.latam || 0);
    const clubsSmiles = Number(clubRow?.smiles || 0);

    return { gross, pax, count, latam, smiles, clubsLatam, clubsSmiles };
  }, [data, focusYM]);

  const today = (data as any)?.today || null;
  const balcaoToday = (data as any)?.balcao?.today || null;
  const balcaoMonth = (data as any)?.balcao?.month || null;
  const balcaoDays = useMemo(() => (((data as any)?.balcao?.days || []) as any[]), [data]);
  const balcaoMonths = useMemo(() => (((data as any)?.balcao?.months || []) as any[]), [data]);
  const balcaoByAirline = ((data as any)?.balcao?.byAirline || []) as any[];
  const balcaoByEmployee = ((data as any)?.balcao?.byEmployee || []) as any[];
  const consolidated = (data as any)?.consolidated || null;

  // ✅ FIX: total por funcionário HOJE (API manda "todayByEmployee")
  // Mantém fallback em "byEmployeeToday" pra não quebrar deploy antigo.
  const byEmployeeToday = useMemo(() => {
    const j = data as any;
    return ((j?.todayByEmployee || j?.byEmployeeToday || []) as any[]).slice();
  }, [data]);

  const todayLabel = today?.date ? String(today.date) : "";

  const balcaoDaySoldByKey = useMemo(() => {
    const m = new Map<string, number>();
    balcaoDays.forEach((row) => {
      const key = String(row?.key || "");
      if (!key) return;
      m.set(key, Number(row?.customerChargeCents || 0));
    });
    return m;
  }, [balcaoDays]);

  const balcaoMonthByKey = useMemo(() => {
    const m = new Map<string, any>();
    balcaoMonths.forEach((row) => {
      const key = String(row?.key || "");
      if (!key) return;
      m.set(key, row);
    });
    return m;
  }, [balcaoMonths]);

  const balcaoMonthSoldByKey = useMemo(() => {
    const m = new Map<string, number>();
    balcaoMonthByKey.forEach((row, key) => {
      m.set(key, Number(row?.customerChargeCents || 0));
    });
    return m;
  }, [balcaoMonthByKey]);

  const balcaoMonthProfitByKey = useMemo(() => {
    const m = new Map<string, number>();
    balcaoMonthByKey.forEach((row, key) => {
      m.set(key, Number(row?.netProfitCents || 0));
    });
    return m;
  }, [balcaoMonthByKey]);

  const salesDailyHistory = useMemo(() => {
    return ((((data as any)?.salesDailyHistory || []) as any[]).map((row) => ({
      key: String(row?.key || ""),
      label: String(row?.label || row?.key || ""),
      salesCents: Number(row?.salesCents || 0),
      balcaoCents: Number(row?.balcaoCents || 0),
      grossCents: Number(row?.grossCents || 0),
    })));
  }, [data]);

  const filteredSalesDailyHistory = useMemo(() => {
    if (salesDailyHistoryRange === "ALL") return salesDailyHistory;
    return salesDailyHistory.slice(-salesDailyHistoryRange);
  }, [salesDailyHistory, salesDailyHistoryRange]);

  const salesDailyHistoryChart = useMemo<ChartPointWithSub[]>(() => {
    return filteredSalesDailyHistory.map((row, idx) => {
      const prev = idx > 0 ? filteredSalesDailyHistory[idx - 1] : null;
      const subParts = [
        `Milhas: ${fmtMoneyBR(row.salesCents)}`,
        `Balcão: ${fmtMoneyBR(row.balcaoCents)}`,
      ];
      if (prev && prev.grossCents > 0) {
        subParts.push(`vs ant: ${fmtPct((row.grossCents - prev.grossCents) / prev.grossCents)}`);
      } else if (prev) {
        subParts.push("vs ant: —");
      }
      return {
        x: row.key,
        y: row.grossCents,
        sub: subParts.join(" • "),
      };
    });
  }, [filteredSalesDailyHistory]);

  const salesDailyHistoryTrendLine = useMemo<ChartPoint[] | undefined>(() => {
    const points = filteredSalesDailyHistory.map((row) => ({
      x: row.key,
      y: row.grossCents,
    }));
    return buildTrendLine(points);
  }, [filteredSalesDailyHistory]);

  const salesDailyHistorySummary = useMemo(() => {
    if (!salesDailyHistory.length) return null;
    return salesDailyHistory.reduce(
      (best, row) => (row.grossCents > best.grossCents ? row : best),
      salesDailyHistory[0]
    );
  }, [salesDailyHistory]);

  const salesMonthlyHistorySummary = useMemo(() => {
    const monthly = new Map<string, number>();

    salesDailyHistory.forEach((row) => {
      const key = String(row.key || "").slice(0, 7);
      if (!key) return;
      monthly.set(key, (monthly.get(key) || 0) + row.grossCents);
    });

    Object.entries(LEGACY_MONTHLY_SALES_CENTS).forEach(([key, cents]) => {
      monthly.set(key, (monthly.get(key) || 0) + Number(cents || 0));
    });

    const rows = Array.from(monthly.entries())
      .map(([key, grossCents]) => ({
        key,
        label: monthLabelLongPT(key),
        grossCents,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    if (!rows.length) return null;
    return rows.reduce((best, row) => (row.grossCents > best.grossCents ? row : best), rows[0]);
  }, [salesDailyHistory]);

  const salesDailyHistoryTotal = useMemo(() => {
    if (!filteredSalesDailyHistory.length) return 0;
    return filteredSalesDailyHistory.reduce((acc, row) => acc + row.grossCents, 0);
  }, [filteredSalesDailyHistory]);

  const salesDailyHistoryAverage = useMemo(() => {
    if (!filteredSalesDailyHistory.length) return 0;
    return Math.round(salesDailyHistoryTotal / filteredSalesDailyHistory.length);
  }, [filteredSalesDailyHistory, salesDailyHistoryTotal]);

  function downloadSalesDailyXlsx() {
    const qs = new URLSearchParams();
    qs.set("range", String(salesDailyHistoryRange));
    window.location.href = `/api/analytics/sales-daily-export?${qs.toString()}`;
  }

  function downloadCompanyXlsx() {
    window.location.href = "/api/analytics/company-export";
  }

  // ✅ Fonte do gráfico depende do modo (TIPADO)
  const chartPoints = useMemo<ChartPoint[]>(() => {
    const src = (chartMode === "DAY" ? (data?.days || []) : (data?.months || [])) as any[];
    return src.map((m: any): ChartPoint => ({
      x: String(m.label || m.key || ""),
      y:
        Number(m.grossCents || 0) +
        (chartMode === "MONTH"
          ? Number(LEGACY_MONTHLY_SALES_CENTS[String(m.key || "")] || 0)
          : 0) +
        (chartMode === "DAY"
          ? Number(balcaoDaySoldByKey.get(String(m.key || "")) || 0)
          : Number(balcaoMonthSoldByKey.get(String(m.key || "")) || 0)),
    }));
  }, [data, chartMode, balcaoDaySoldByKey, balcaoMonthSoldByKey]);

  const avgMonthlyTotalCents = useMemo(() => {
    const rows = (data?.months || []) as any[];
    if (!rows.length) return 0;
    const sum = rows.reduce(
      (acc, row) =>
        acc +
        Number(row?.grossCents || 0) +
        Number(LEGACY_MONTHLY_SALES_CENTS[String(row?.key || "")] || 0) +
        Number(balcaoMonthSoldByKey.get(String(row?.key || "")) || 0),
      0
    );
    return Math.round(sum / rows.length);
  }, [data, balcaoMonthSoldByKey]);

  const avgMonthlySalesCents = useMemo(() => {
    const rows = (data?.months || []) as any[];
    if (!rows.length) return 0;
    const sum = rows.reduce((acc, row) => acc + Number(row?.grossCents || 0), 0);
    return Math.round(sum / rows.length);
  }, [data]);

  // ✅ % vs dia anterior (só no diário) (TIPADO)
  const chartWithDelta = useMemo<ChartPointWithSub[]>(() => {
    return chartPoints.map((p: ChartPoint, i: number): ChartPointWithSub => {
      if (chartMode !== "DAY" || i === 0) return { ...p, sub: undefined };
      const prev = chartPoints[i - 1]?.y ?? 0;
      if (prev <= 0) return { ...p, sub: "vs ant: —" };
      const pct = (p.y - prev) / prev;
      return { ...p, sub: `vs ant: ${fmtPct(pct)}` };
    });
  }, [chartPoints, chartMode]);

  const avgInChart = useMemo<number>(() => {
    const ys = chartPoints.map((p) => p.y);
    if (!ys.length) return 0;
    const sum = ys.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / ys.length);
  }, [chartPoints]);

  const extraLine = useMemo<ChartPoint[] | undefined>(() => {
    if (chartMode !== "DAY" || !maWindow) return undefined;
    const ys = chartPoints.map((p) => p.y);
    const ma = movingAverage(ys, maWindow);
    return chartPoints.map((p, i) => ({ x: p.x, y: ma[i] || 0 }));
  }, [chartPoints, chartMode, maWindow]);

  const trendLine = useMemo<ChartPoint[] | undefined>(() => {
    return buildTrendLine(chartPoints);
  }, [chartPoints]);

  const chartTrend = useMemo(() => {
    if (!chartPoints.length) return null;
    const ys = chartPoints.map((p) => p.y);
    const first = ys[0] || 0;
    const last = ys[ys.length - 1] || 0;
    const delta = last - first;
    const avg = ys.reduce((acc, v) => acc + v, 0) / ys.length;
    const trendStart = trendLine?.[0]?.y ?? first;
    const trendEnd = trendLine?.[trendLine.length - 1]?.y ?? last;

    // Tendência do período: média do início vs média do fim da janela exibida.
    // Isso evita distorção quando o primeiro/último ponto é um outlier.
    const segmentSize = Math.max(2, Math.floor(ys.length / 3));
    const firstSegment = ys.slice(0, segmentSize);
    const lastSegment = ys.slice(-segmentSize);
    const segmentStartAvg =
      firstSegment.reduce((acc, v) => acc + v, 0) / Math.max(1, firstSegment.length);
    const segmentEndAvg =
      lastSegment.reduce((acc, v) => acc + v, 0) / Math.max(1, lastSegment.length);

    const trendDelta = segmentEndAvg - segmentStartAvg;
    const deltaPct = segmentStartAvg > 0 ? trendDelta / segmentStartAvg : null;
    const max = Math.max(...ys);
    const min = Math.min(...ys);

    let r2 = 0;
    if (trendLine?.length === chartPoints.length) {
      let ssRes = 0;
      let ssTot = 0;
      chartPoints.forEach((p, i) => {
        const pred = trendLine[i]?.y ?? p.y;
        ssRes += (p.y - pred) * (p.y - pred);
        ssTot += (p.y - avg) * (p.y - avg);
      });
      r2 = ssTot <= 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
    }

    const absPct = Math.abs(deltaPct || 0);
    let direction = "Lateral";
    if (r2 >= 0.18 && absPct >= 0.04) {
      direction = (deltaPct || 0) > 0 ? "Alta" : "Baixa";
    } else if (r2 >= 0.1 && absPct >= 0.02) {
      direction = (deltaPct || 0) > 0 ? "Alta leve" : "Baixa leve";
    }

    return {
      first,
      last,
      delta,
      trendStart,
      trendEnd,
      trendDelta,
      deltaPct,
      segmentSize,
      segmentStartAvg,
      segmentEndAvg,
      max,
      min,
      direction,
      fit: r2,
    };
  }, [chartPoints, trendLine]);

  const weekdayBars = useMemo(() => {
    return (data?.byDow || []).map((d: any) => ({
      label: d.dow,
      value: Number(d.grossCents || 0),
      pct: Number(d.pct || 0),
    }));
  }, [data]);

  const programByMonthBars = useMemo(() => {
    return (data?.months || []).map((m: any) => ({
      month: m.label || m.key,
      LATAM: Number(m.byProgram?.LATAM || 0),
      SMILES: Number(m.byProgram?.SMILES || 0),
    }));
  }, [data]);

  const milheiroDailyPoints = useMemo<MilheiroPoint[]>(() => {
    const rows = ((data as any)?.milheiroDaily || []) as any[];
    return rows.map((r) => ({
      key: String(r.key || ""),
      x: String(r.label || r.key || ""),
      latam: Number(r.latamMilheiroCents || 0),
      smiles: Number(r.smilesMilheiroCents || 0),
    }));
  }, [data]);

  const milheiroMonthlyPoints = useMemo<MilheiroPoint[]>(() => {
    const rows = ((data as any)?.milheiroMonthly || []) as any[];
    return rows.map((r) => ({
      key: String(r.key || ""),
      x: String(r.label || r.key || ""),
      latam: Number(r.latamMilheiroCents || 0),
      smiles: Number(r.smilesMilheiroCents || 0),
    }));
  }, [data]);

  const milheiroDailyWithDelta = useMemo<MilheiroPoint[]>(() => {
    return milheiroDailyPoints.map((row, i) => {
      if (i === 0) return row;
      const prev = milheiroDailyPoints[i - 1];
      const latamPrev = prev?.latam || 0;
      const smilesPrev = prev?.smiles || 0;
      return {
        ...row,
        subLatam: latamPrev > 0 ? `vs ant: ${fmtPct((row.latam - latamPrev) / latamPrev)}` : "vs ant: —",
        subSmiles: smilesPrev > 0 ? `vs ant: ${fmtPct((row.smiles - smilesPrev) / smilesPrev)}` : "vs ant: —",
      };
    });
  }, [milheiroDailyPoints]);

  const milheiroMonthlyWithDelta = useMemo<MilheiroPoint[]>(() => {
    return milheiroMonthlyPoints.map((row, i) => {
      if (i === 0) return row;
      const prev = milheiroMonthlyPoints[i - 1];
      const latamPrev = prev?.latam || 0;
      const smilesPrev = prev?.smiles || 0;
      return {
        ...row,
        subLatam: latamPrev > 0 ? `vs mês ant: ${fmtPct((row.latam - latamPrev) / latamPrev)}` : "vs mês ant: —",
        subSmiles: smilesPrev > 0 ? `vs mês ant: ${fmtPct((row.smiles - smilesPrev) / smilesPrev)}` : "vs mês ant: —",
      };
    });
  }, [milheiroMonthlyPoints]);

  const milheiroComparison = useMemo(() => {
    const build = (rows: MilheiroPoint[], key: "latam" | "smiles") => {
      if (!rows.length) return null;
      const currentRow = rows[rows.length - 1];
      const prevRow = rows.length > 1 ? rows[rows.length - 2] : null;
      const current = key === "latam" ? currentRow.latam : currentRow.smiles;
      const previous = prevRow ? (key === "latam" ? prevRow.latam : prevRow.smiles) : 0;
      const delta = current - previous;
      const deltaPct = previous > 0 ? delta / previous : null;
      return {
        current,
        currentLabel: currentRow.x,
        previous,
        previousLabel: prevRow?.x || "—",
        delta,
        deltaPct,
      };
    };

    return {
      daily: {
        latam: build(milheiroDailyPoints, "latam"),
        smiles: build(milheiroDailyPoints, "smiles"),
      },
      monthly: {
        latam: build(milheiroMonthlyPoints, "latam"),
        smiles: build(milheiroMonthlyPoints, "smiles"),
      },
    };
  }, [milheiroDailyPoints, milheiroMonthlyPoints]);

  const topClients = useMemo(() => {
    return (data?.topClients || []) as any[];
  }, [data]);

  const best = data?.summary?.bestDayOfWeek;

  const monthLabel = data?.filters?.month || focusYM;

  const byEmployeeMonth = useMemo(() => {
    return ((data?.byEmployee || []) as any[]).filter((r) => (r?.grossCents || 0) > 0);
  }, [data]);

  const currentMonthPerformance = useMemo(() => {
    const p = (data as any)?.currentMonthPerformance;
    const b = (data as any)?.balcao?.currentMonth || null;
    if (!p && !b) return null;

    const soldSalesCents = Number(p?.soldWithoutFeeCents || 0);
    const soldBalcaoCents = Number(b?.customerChargeCents || 0);
    const soldWithoutFeeCents = soldSalesCents + soldBalcaoCents;

    const profitSalesCents = Number(p?.profitAfterTaxWithoutFeeCents || 0);
    const profitBalcaoCents = Number(b?.netProfitCents || 0);
    const profitAfterTaxWithoutFeeCents = profitSalesCents + profitBalcaoCents;

    const lossCents = Number(p?.lossCents || 0);
    const salesOverProfitPercent =
      soldWithoutFeeCents > 0
        ? (profitAfterTaxWithoutFeeCents / soldWithoutFeeCents) * 100
        : null;

    return {
      month: String(p?.month || b?.key || ""),
      soldWithoutFeeCents,
      soldSalesCents,
      soldBalcaoCents,
      profitAfterTaxWithoutFeeCents,
      profitSalesCents,
      profitBalcaoCents,
      lossCents,
      salesOverProfitPercent,
    };
  }, [data]);

  const profitTimeline = useMemo(() => {
    const rows = ((data as any)?.profitMonths || []) as any[];
    return rows.map((m) => {
      const key = String(m.key || "");
      const soldSalesCents = Number(m.soldWithoutFeeCents || 0);
      const soldBalcaoCents = Number(balcaoMonthSoldByKey.get(key) || 0);
      const soldTotalCents = soldSalesCents + soldBalcaoCents;

      const profitSalesCents =
        Number(m.profitAfterTaxWithoutFeeCents || 0) +
        Number(LEGACY_MONTHLY_PROFIT_CENTS[key] || 0);
      const profitBalcaoCents = Number(balcaoMonthProfitByKey.get(key) || 0);
      const profitAfterTaxWithoutFeeCents = profitSalesCents + profitBalcaoCents;

      const lossCents = Number(m.lossCents || 0);
      const profitPercent =
        soldTotalCents > 0 ? (profitAfterTaxWithoutFeeCents / soldTotalCents) * 100 : null;
      return {
        key,
        x: String(m.label || m.key || ""),
        y: profitAfterTaxWithoutFeeCents,
        lossCents,
        soldTotalCents,
        soldSalesCents,
        soldBalcaoCents,
        profitSalesCents,
        profitBalcaoCents,
        profitPercent,
      };
    });
  }, [data, balcaoMonthSoldByKey, balcaoMonthProfitByKey]);

  const currentVsPrevious = useMemo(() => {
    const c = (data as any)?.currentVsPrevious;
    const bCurrent = (data as any)?.balcao?.currentMonth || null;
    const bPrevious = (data as any)?.balcao?.previousMonth || null;
    if (!c && !bCurrent && !bPrevious) return null;

    const currentProfitSalesCents = Number(c?.current?.profitAfterTaxWithoutFeeCents || 0);
    const previousProfitSalesCents = Number(c?.previous?.profitAfterTaxWithoutFeeCents || 0);
    const currentProfitBalcaoCents = Number(bCurrent?.netProfitCents || 0);
    const previousProfitBalcaoCents = Number(bPrevious?.netProfitCents || 0);

    const currentProfitCents = currentProfitSalesCents + currentProfitBalcaoCents;
    const previousProfitCents = previousProfitSalesCents + previousProfitBalcaoCents;

    const currentSoldSalesCents = Number(c?.current?.soldWithoutFeeCents || 0);
    const previousSoldSalesCents = Number(c?.previous?.soldWithoutFeeCents || 0);
    const currentSoldBalcaoCents = Number(bCurrent?.customerChargeCents || 0);
    const previousSoldBalcaoCents = Number(bPrevious?.customerChargeCents || 0);

    const currentSoldTotalCents = currentSoldSalesCents + currentSoldBalcaoCents;
    const previousSoldTotalCents = previousSoldSalesCents + previousSoldBalcaoCents;

    const currentProfitPercent =
      currentSoldTotalCents > 0 ? (currentProfitCents / currentSoldTotalCents) * 100 : null;
    const previousProfitPercent =
      previousSoldTotalCents > 0 ? (previousProfitCents / previousSoldTotalCents) * 100 : null;

    const deltaProfitCents = currentProfitCents - previousProfitCents;
    const deltaProfitPercent =
      previousProfitCents !== 0 ? (deltaProfitCents / Math.abs(previousProfitCents)) * 100 : null;

    return {
      currentMonth: String(c?.currentMonth || bCurrent?.key || ""),
      previousMonth: String(c?.previousMonth || bPrevious?.key || ""),
      currentProfitCents,
      previousProfitCents,
      currentProfitSalesCents,
      previousProfitSalesCents,
      currentProfitBalcaoCents,
      previousProfitBalcaoCents,
      currentLossCents: Number(c?.current?.lossCents || 0),
      previousLossCents: Number(c?.previous?.lossCents || 0),
      currentProfitPercent,
      previousProfitPercent,
      deltaProfitCents,
      deltaProfitPercent,
    };
  }, [data]);

  const profitPerDayComparison = useMemo(() => {
    if (!currentVsPrevious) return null;
    const todayISO = String(today?.date || "");
    const currentMonthDays = elapsedDaysInMonthFromKey(
      currentVsPrevious.currentMonth,
      todayISO
    );
    const previousMonthDays = elapsedDaysInMonthFromKey(
      currentVsPrevious.previousMonth,
      todayISO
    );
    const currentPerDay =
      currentMonthDays > 0
        ? Math.round((currentVsPrevious.currentProfitCents || 0) / currentMonthDays)
        : 0;
    const previousPerDay =
      previousMonthDays > 0
        ? Math.round((currentVsPrevious.previousProfitCents || 0) / previousMonthDays)
        : 0;
    const delta = currentPerDay - previousPerDay;
    const deltaPct = previousPerDay > 0 ? delta / previousPerDay : null;
    return {
      currentMonth: currentVsPrevious.currentMonth,
      previousMonth: currentVsPrevious.previousMonth,
      currentPerDay,
      previousPerDay,
      delta,
      deltaPct,
      currentMonthDays,
      previousMonthDays,
    };
  }, [currentVsPrevious, today?.date]);

  const byEmployeeMonthPie = useMemo(() => {
    const rows = [...byEmployeeMonth].sort((a, b) => (b.grossCents || 0) - (a.grossCents || 0));
    const total = rows.reduce((acc, r) => acc + (r.grossCents || 0), 0);
    if (!total) return [];

    const topN = 6;
    const top = rows.slice(0, topN);
    const rest = rows.slice(topN);
    const restTotal = rest.reduce((acc, r) => acc + (r.grossCents || 0), 0);

    const slices = top.map((r, i) => ({
      label: r.name || r.login || "—",
      value: r.grossCents || 0,
      pct: (r.grossCents || 0) / total,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    if (restTotal > 0) {
      slices.push({
        label: "Outros",
        value: restTotal,
        pct: restTotal / total,
        color: CHART_COLORS[topN % CHART_COLORS.length],
      });
    }

    return slices;
  }, [byEmployeeMonth]);

  const chartPeriodLabel = useMemo(() => {
    if (chartMode === "MONTH") return `${fmtInt(monthsBack)} meses`;
    if (daysPreset === "CUSTOM" && dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
    return `últimos ${fmtInt(daysBack)} dias`;
  }, [chartMode, monthsBack, daysPreset, dateFrom, dateTo, daysBack]);

  const comparisonTone: CardTone =
    currentVsPrevious?.deltaProfitPercent == null
      ? "slate"
      : currentVsPrevious.deltaProfitPercent >= 0
        ? "emerald"
        : "rose";

  const milheiroTone = (deltaPct: number | null | undefined, delta: number | undefined): CardTone => {
    if (deltaPct == null || delta == null) return "slate";
    return delta >= 0 ? "emerald" : "rose";
  };

  const milheiroSub = (
    prevLabel: string,
    delta: number | undefined,
    deltaPct: number | null | undefined,
    periodLabel: "dia" | "mês"
  ) => {
    if (delta == null) return `Sem base para comparação de ${periodLabel}.`;
    const deltaSign = delta > 0 ? "+" : "";
    const pctText = deltaPct == null ? "—" : fmtPct(deltaPct);
    return `vs ${periodLabel} anterior (${prevLabel}): ${deltaSign}${fmtMoneyBR(delta)} (${pctText})`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xl font-semibold">Análise de dados</div>
          <div className="text-sm text-neutral-500">Vendas, passageiros, dias, funcionários, clientes e clubes.</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={monthsBack}
            onChange={(e) => setMonthsBack(Number(e.target.value))}
          >
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>

          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={focusYM}
            onChange={(e) => setFocusYM(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* alternar gráfico */}
          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={chartMode}
            onChange={(e) => setChartMode(e.target.value as ChartMode)}
          >
            <option value="MONTH">Gráfico: mês a mês</option>
            <option value="DAY">Gráfico: diário</option>
          </select>

          {/* controles do diário */}
          {chartMode === "DAY" ? (
            <>
              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm"
                value={daysPreset}
                onChange={(e) => {
                  const v = e.target.value;
                  setDaysPreset(v === "CUSTOM" ? "CUSTOM" : (Number(v) as 7 | 15 | 30));
                }}
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={15}>Últimos 15 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value="CUSTOM">Personalizado</option>
              </select>

              {daysPreset === "CUSTOM" ? (
                <>
                  <input
                    type="date"
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <input
                    type="date"
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </>
              ) : null}

              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm"
                value={maWindow}
                onChange={(e) => setMaWindow(Number(e.target.value) as MAWindow)}
              >
                <option value={0}>Média móvel: off</option>
                <option value={7}>Média móvel: 7d</option>
                <option value={15}>Média móvel: 15d</option>
                <option value={30}>Média móvel: 30d</option>
              </select>
            </>
          ) : null}

          <button className="rounded-xl border bg-white px-3 py-2 text-sm" onClick={load} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar"}
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
            onClick={downloadCompanyXlsx}
            title="Baixar Excel completo da análise da empresa"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Excel completo
          </button>
        </div>
      </div>

      {/* HOJE */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title={today?.date ? `Total vendido hoje (${today.date})` : "Total vendido hoje"}
          value={fmtMoneyBR(today?.grossCents || 0)}
          sub={`${fmtInt(today?.salesCount || 0)} vendas • ${fmtInt(today?.passengers || 0)} pax`}
          tone="sky"
        />
        <Card
          title="Total do dia (com taxa embarque)"
          value={fmtMoneyBR(today?.totalCents || 0)}
          sub={`Taxa embarque: ${fmtMoneyBR(today?.feeCents || 0)}`}
          tone="emerald"
        />
        <Card
          title="Mês selecionado"
          value={data?.summary?.monthLabel || (data?.filters?.month || focusYM) || "—"}
          sub={`Período no gráfico: ${chartPeriodLabel}`}
          tone="amber"
        />
        <Card
          title="Balcão hoje (valor vendido)"
          value={fmtMoneyBR(balcaoToday?.customerChargeCents || 0)}
          sub={`${fmtInt(balcaoToday?.operationsCount || 0)} operações • lucro líquido: ${fmtMoneyBR(
            balcaoToday?.netProfitCents || 0
          )}`}
          tone="teal"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card
          title="Maior dia vendido (histórico)"
          value={fmtMoneyBR(salesDailyHistorySummary?.grossCents || 0)}
          sub={
            salesDailyHistorySummary
              ? dayLabelLongPT(salesDailyHistorySummary.key)
              : "Sem histórico suficiente"
          }
          tone="sky"
        />
        <Card
          title="Maior mês vendido (histórico)"
          value={fmtMoneyBR(salesMonthlyHistorySummary?.grossCents || 0)}
          sub={salesMonthlyHistorySummary ? salesMonthlyHistorySummary.label : "Sem histórico suficiente"}
          tone="emerald"
        />
      </div>

      {/* HOJE por funcionário */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Total por funcionário {todayLabel ? `(hoje ${todayLabel})` : "(hoje)"}</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-neutral-500">
                <th className="py-2">Funcionário</th>
                <th className="py-2">Vendas</th>
                <th className="py-2">PAX</th>
                <th className="py-2 text-right">Total (sem taxa)</th>
              </tr>
            </thead>
            <tbody>
              {byEmployeeToday.map((r: any) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-neutral-500">{r.login}</div>
                  </td>
                  <td className="py-2">{fmtInt(r.salesCount || 0)}</td>
                  <td className="py-2">{fmtInt(r.passengers || 0)}</td>
                  <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.grossCents || 0)}</td>
                </tr>
              ))}

              {!byEmployeeToday.length ? (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                    Sem vendas hoje.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Total vendido no mês (milhas)"
          value={fmtMoneyBR(consolidated?.soldSalesCents || kpis?.gross || 0)}
          sub={`Média mensal (milhas): ${fmtMoneyBR(avgMonthlySalesCents)} • Total com balcão: ${fmtMoneyBR(
            consolidated?.soldTotalCents || kpis?.gross || 0
          )}`}
          tone="teal"
        />
        <Card title="Quantidade de vendas no mês" value={fmtInt(kpis?.count || 0)} tone="sky" />
        <Card title="Passageiros emitidos no mês" value={fmtInt(kpis?.pax || 0)} tone="emerald" />
        <Card
          title="LATAM vs SMILES (mês)"
          value={`${fmtMoneyBR(kpis?.latam || 0)} / ${fmtMoneyBR(kpis?.smiles || 0)}`}
          sub={`Clubes: LATAM ${fmtInt(kpis?.clubsLatam || 0)} | SMILES ${fmtInt(kpis?.clubsSmiles || 0)}`}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm">
          <div className="inline-flex rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
            Principal
          </div>
          <div className="mt-2 text-xs uppercase tracking-wide text-indigo-700">Total mês (milhas + balcão)</div>
          <div className="mt-1 text-3xl font-bold text-indigo-950">
            {fmtMoneyBR(consolidated?.soldTotalCents || 0)}
          </div>
          <div className="mt-2 text-sm text-indigo-900/80">
            Milhas: {fmtMoneyBR(consolidated?.soldSalesCents || 0)} • Balcão:{" "}
            {fmtMoneyBR(consolidated?.soldBalcaoCents || 0)}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm">
          <div className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            Principal
          </div>
          <div className="mt-2 text-xs uppercase tracking-wide text-emerald-700">
            Lucro mês (milhas + balcão)
          </div>
          <div className="mt-1 text-3xl font-bold text-emerald-950">
            {fmtMoneyBR(consolidated?.profitTotalAfterTaxCents || 0)}
          </div>
          <div className="mt-2 text-sm text-emerald-900/80">
            Milhas: {fmtMoneyBR(consolidated?.profitSalesAfterTaxWithoutFeeCents || 0)} • Balcão:{" "}
            {fmtMoneyBR(consolidated?.profitBalcaoAfterTaxCents || 0)}
            {profitPerDayComparison
              ? ` • Lucro/dia (${profitPerDayComparison.currentMonth}, ${fmtInt(
                  profitPerDayComparison.currentMonthDays || 0
                )} dias corridos): ${fmtMoneyBR(
                  profitPerDayComparison.currentPerDay
                )} • Mês ${profitPerDayComparison.previousMonth}: ${fmtMoneyBR(
                  profitPerDayComparison.previousPerDay
                )} • Δ: ${(profitPerDayComparison.delta || 0) > 0 ? "+" : ""}${fmtMoneyBR(
                  profitPerDayComparison.delta || 0
                )}${profitPerDayComparison.deltaPct == null ? " (—)" : ` (${fmtPct(profitPerDayComparison.deltaPct)})`}`
              : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card
          title="Balcão no mês (valor vendido)"
          value={fmtMoneyBR(balcaoMonth?.customerChargeCents || 0)}
          sub={`${fmtInt(balcaoMonth?.operationsCount || 0)} operações • ${fmtInt(
            balcaoMonth?.points || 0
          )} pontos`}
          tone="amber"
        />
        <Card
          title="Balcão no mês (lucro líquido)"
          value={fmtMoneyBR(balcaoMonth?.netProfitCents || 0)}
          sub={`Lucro bruto: ${fmtMoneyBR(balcaoMonth?.profitCents || 0)} • Imposto: ${fmtMoneyBR(
            balcaoMonth?.taxCents || 0
          )}`}
          tone="emerald"
        />
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white p-4 shadow-sm">
        <div className="text-xs text-indigo-700">Métrica do mês corrente {currentMonthPerformance?.month || "—"}</div>
        <div className="mt-1 text-2xl font-semibold text-indigo-900">
          {currentMonthPerformance?.salesOverProfitPercent !== null &&
          currentMonthPerformance?.salesOverProfitPercent !== undefined
            ? fmtPctRaw(currentMonthPerformance.salesOverProfitPercent)
            : "—"}
        </div>
        <div className="mt-1 text-sm text-indigo-900/80">
          Lucro pós-imposto com débito de prejuízo (sem taxa) ÷ Vendas sem taxa
        </div>
        <div className="mt-2 text-xs text-indigo-900/70">
          Vendas totais: {fmtMoneyBR(currentMonthPerformance?.soldWithoutFeeCents || 0)} (Milhas:{" "}
          {fmtMoneyBR(currentMonthPerformance?.soldSalesCents || 0)} • Balcão:{" "}
          {fmtMoneyBR(currentMonthPerformance?.soldBalcaoCents || 0)}) • Lucro total:{" "}
          {fmtMoneyBR(currentMonthPerformance?.profitAfterTaxWithoutFeeCents || 0)} (Milhas:{" "}
          {fmtMoneyBR(currentMonthPerformance?.profitSalesCents || 0)} • Balcão:{" "}
          {fmtMoneyBR(currentMonthPerformance?.profitBalcaoCents || 0)}) • Prejuízo debitado (milhas):{" "}
          {fmtMoneyBR(currentMonthPerformance?.lossCents || 0)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title={`Lucro ${currentVsPrevious?.currentMonth || "mês corrente"} (pós-imposto e prejuízo)`}
          value={fmtMoneyBR(currentVsPrevious?.currentProfitCents || 0)}
          sub={
            currentVsPrevious?.currentProfitPercent == null
              ? `Milhas: ${fmtMoneyBR(currentVsPrevious?.currentProfitSalesCents || 0)} • Balcão: ${fmtMoneyBR(
                  currentVsPrevious?.currentProfitBalcaoCents || 0
                )} • Prejuízo (milhas): ${fmtMoneyBR(currentVsPrevious?.currentLossCents || 0)}`
              : `Milhas: ${fmtMoneyBR(currentVsPrevious?.currentProfitSalesCents || 0)} • Balcão: ${fmtMoneyBR(
                  currentVsPrevious?.currentProfitBalcaoCents || 0
                )} • Margem total: ${fmtPctRaw(currentVsPrevious.currentProfitPercent)} • Prejuízo (milhas): ${fmtMoneyBR(
                  currentVsPrevious?.currentLossCents || 0
                )}`
          }
          tone="emerald"
        />
        <Card
          title={`Lucro ${currentVsPrevious?.previousMonth || "mês anterior"} (pós-imposto e prejuízo)`}
          value={fmtMoneyBR(currentVsPrevious?.previousProfitCents || 0)}
          sub={
            currentVsPrevious?.previousProfitPercent == null
              ? `Milhas: ${fmtMoneyBR(currentVsPrevious?.previousProfitSalesCents || 0)} • Balcão: ${fmtMoneyBR(
                  currentVsPrevious?.previousProfitBalcaoCents || 0
                )} • Prejuízo (milhas): ${fmtMoneyBR(currentVsPrevious?.previousLossCents || 0)}`
              : `Milhas: ${fmtMoneyBR(currentVsPrevious?.previousProfitSalesCents || 0)} • Balcão: ${fmtMoneyBR(
                  currentVsPrevious?.previousProfitBalcaoCents || 0
                )} • Margem total: ${fmtPctRaw(currentVsPrevious.previousProfitPercent)} • Prejuízo (milhas): ${fmtMoneyBR(
                  currentVsPrevious?.previousLossCents || 0
                )}`
          }
          tone="sky"
        />
        <Card
          title="Comparação com mês anterior"
          value={
            currentVsPrevious?.deltaProfitPercent == null
              ? "—"
              : fmtPctSigned(currentVsPrevious.deltaProfitPercent)
          }
          sub={`Diferença de lucro total: ${fmtMoneyBR(currentVsPrevious?.deltaProfitCents || 0)}`}
          tone={comparisonTone}
        />
      </div>

      <SimpleLineChart
        title="Timeline de lucro mensal total (milhas + balcão)"
        data={profitTimeline.map((m) => ({
          x: m.x,
          y: m.y,
          sub:
            m.profitPercent == null
              ? `Milhas: ${fmtMoneyBR(m.profitSalesCents)} • Balcão: ${fmtMoneyBR(
                  m.profitBalcaoCents
                )} • prejuízo (milhas): ${fmtMoneyBR(m.lossCents)}`
              : `Margem total: ${fmtPctRaw(m.profitPercent)} • Milhas: ${fmtMoneyBR(
                  m.profitSalesCents
                )} • Balcão: ${fmtMoneyBR(m.profitBalcaoCents)} • prejuízo (milhas): ${fmtMoneyBR(m.lossCents)}`,
        }))}
        accent="text-emerald-700"
        valueLabel="Lucro do mês"
        footer="Linha mensal de lucro total (milhas + balcão), após impostos e já abatendo prejuízos do mês nas milhas."
      />

      {/* Gráfico evolução */}
      <SimpleLineChart
        title={chartMode === "DAY" ? "Evolução diária (milhas + balcão)" : "Evolução mês a mês (milhas + balcão)"}
        data={chartWithDelta}
        extraLine={extraLine}
        trendLine={trendLine}
        summary={
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] text-slate-500">Tendência (período)</div>
              <div
                className={`text-sm font-semibold ${
                  (chartTrend?.deltaPct || 0) > 0
                    ? "text-emerald-700"
                    : (chartTrend?.deltaPct || 0) < 0
                      ? "text-rose-700"
                      : "text-slate-700"
                }`}
              >
                {chartTrend?.direction || "—"}
                {chartTrend?.deltaPct != null ? ` • ${fmtPct(chartTrend.deltaPct)}` : ""}
              </div>
              <div className="text-[10px] text-slate-500">
                qualidade: {chartTrend ? fmtPctRaw(chartTrend.fit * 100) : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] text-slate-500">Variação no período</div>
              <div
                className={`text-sm font-semibold ${
                  (chartTrend?.trendDelta || 0) > 0
                    ? "text-emerald-700"
                    : (chartTrend?.trendDelta || 0) < 0
                      ? "text-rose-700"
                      : "text-slate-700"
                }`}
              >
                {chartTrend ? fmtMoneyBR(chartTrend.trendDelta) : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] text-slate-500">
                Maior {chartMode === "DAY" ? "dia" : "mês"}
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {chartTrend ? fmtMoneyBR(chartTrend.max) : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] text-slate-500">
                Menor {chartMode === "DAY" ? "dia" : "mês"}
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {chartTrend ? fmtMoneyBR(chartTrend.min) : "—"}
              </div>
            </div>
          </div>
        }
        accent="text-sky-900"
        valueLabel={chartMode === "DAY" ? "Total vendido no dia" : "Total vendido no mês"}
        footer={
          chartMode === "DAY"
            ? `Média diária no período: ${fmtMoneyBR(avgInChart)}${
                chartTrend
                  ? ` • Tendência: média dos primeiros ${chartTrend.segmentSize} vs últimos ${chartTrend.segmentSize} dias`
                  : ""
              }${maWindow ? ` • Linha cinza = média móvel ${maWindow}d` : ""} • Linha pontilhada = tendência • Valores consolidados de milhas + balcão`
            : `Média mensal no período (milhas + balcão): ${fmtMoneyBR(avgMonthlyTotalCents)}`
        }
      />

      <SimpleLineChart
        title="Venda por dia (milhas + balcão)"
        data={salesDailyHistoryChart}
        trendLine={salesDailyHistoryTrendLine}
        summary={
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto,1fr] lg:items-center">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-neutral-500">Período:</span>
              <select
                className="rounded-lg border bg-white px-2 py-1 text-xs"
                value={salesDailyHistoryRange}
                onChange={(e) =>
                  setSalesDailyHistoryRange(
                    e.target.value === "ALL"
                      ? "ALL"
                      : (Number(e.target.value) as SalesDailyHistoryRange)
                  )
                }
              >
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
                <option value={120}>120 dias</option>
                <option value={180}>180 dias</option>
                <option value={365}>1 ano</option>
                <option value="ALL">Todo período</option>
              </select>
              <button
                type="button"
                onClick={downloadSalesDailyXlsx}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Baixar XLSX
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Total do período</div>
                <div className="text-sm font-semibold text-slate-800">
                  {fmtMoneyBR(salesDailyHistoryTotal)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Média por dia</div>
                <div className="text-sm font-semibold text-slate-800">
                  {fmtMoneyBR(salesDailyHistoryAverage)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Maior dia no período</div>
                {filteredSalesDailyHistory.length ? (
                  <div className="text-[10px] text-slate-500">
                    {dayLabelLongPT(
                      filteredSalesDailyHistory.reduce(
                        (best, row) => (row.grossCents > best.grossCents ? row : best),
                        filteredSalesDailyHistory[0]
                      ).key
                    )}
                  </div>
                ) : null}
                <div className="text-sm font-semibold text-slate-800">
                  {filteredSalesDailyHistory.length
                    ? fmtMoneyBR(
                        filteredSalesDailyHistory.reduce(
                          (best, row) => (row.grossCents > best.grossCents ? row : best),
                          filteredSalesDailyHistory[0]
                        ).grossCents
                      )
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        }
        valueLabel="Total vendido no dia"
        footer={`Período exibido: ${
          salesDailyHistoryRange === "ALL"
            ? "todo o histórico compilado"
            : `últimos ${salesDailyRangeLabel(salesDailyHistoryRange).toLowerCase()}`
        } • Linha pontilhada = tendência • Valores consolidados de milhas + balcão.`}
      />

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Milheiro vendido (LATAM e Smiles)</div>
        <div className="mt-1 text-xs text-neutral-500">
          Comparativo diário e mensal do valor de milheiro efetivamente vendido.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title={`LATAM (dia ${milheiroComparison.daily.latam?.currentLabel || "—"})`}
          value={fmtMoneyBR(milheiroComparison.daily.latam?.current || 0)}
          sub={milheiroSub(
            milheiroComparison.daily.latam?.previousLabel || "—",
            milheiroComparison.daily.latam?.delta,
            milheiroComparison.daily.latam?.deltaPct,
            "dia"
          )}
          tone={milheiroTone(
            milheiroComparison.daily.latam?.deltaPct,
            milheiroComparison.daily.latam?.delta
          )}
        />
        <Card
          title={`Smiles (dia ${milheiroComparison.daily.smiles?.currentLabel || "—"})`}
          value={fmtMoneyBR(milheiroComparison.daily.smiles?.current || 0)}
          sub={milheiroSub(
            milheiroComparison.daily.smiles?.previousLabel || "—",
            milheiroComparison.daily.smiles?.delta,
            milheiroComparison.daily.smiles?.deltaPct,
            "dia"
          )}
          tone={milheiroTone(
            milheiroComparison.daily.smiles?.deltaPct,
            milheiroComparison.daily.smiles?.delta
          )}
        />
        <Card
          title={`LATAM (mês ${milheiroComparison.monthly.latam?.currentLabel || "—"})`}
          value={fmtMoneyBR(milheiroComparison.monthly.latam?.current || 0)}
          sub={milheiroSub(
            milheiroComparison.monthly.latam?.previousLabel || "—",
            milheiroComparison.monthly.latam?.delta,
            milheiroComparison.monthly.latam?.deltaPct,
            "mês"
          )}
          tone={milheiroTone(
            milheiroComparison.monthly.latam?.deltaPct,
            milheiroComparison.monthly.latam?.delta
          )}
        />
        <Card
          title={`Smiles (mês ${milheiroComparison.monthly.smiles?.currentLabel || "—"})`}
          value={fmtMoneyBR(milheiroComparison.monthly.smiles?.current || 0)}
          sub={milheiroSub(
            milheiroComparison.monthly.smiles?.previousLabel || "—",
            milheiroComparison.monthly.smiles?.delta,
            milheiroComparison.monthly.smiles?.deltaPct,
            "mês"
          )}
          tone={milheiroTone(
            milheiroComparison.monthly.smiles?.deltaPct,
            milheiroComparison.monthly.smiles?.delta
          )}
        />
      </div>

      <MilheiroLineChart
        title="Milheiro vendido por dia (linha)"
        data={milheiroDailyWithDelta}
        toolbar={
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500">Período:</span>
            <select
              className="rounded-lg border bg-white px-2 py-1 text-xs"
              value={milheiroDaysBack}
              onChange={(e) => setMilheiroDaysBack(Number(e.target.value))}
            >
              <option value={7}>7 dias</option>
              <option value={15}>15 dias</option>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias</option>
              <option value={180}>180 dias</option>
            </select>
          </div>
        }
        footer={`Comparação diária entre LATAM e Smiles no período de ${
          milheiroDailyWithDelta.length ? fmtInt(milheiroDailyWithDelta.length) : "0"
        } dias.`}
      />

      <MilheiroMonthlyBarChart
        title="Milheiro vendido por mês (barras)"
        data={milheiroMonthlyWithDelta}
        footer={`Comparação mensal LATAM x Smiles nos últimos ${fmtInt(milheiroMonthlyWithDelta.length || 0)} meses.`}
      />

      {/* Dias da semana */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SimpleBarChart title="Comparativo por dia da semana (período)" data={weekdayBars} />

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Dia da semana que mais vende</div>
          <div className="mt-2 text-2xl font-semibold">{best?.dow || "—"}</div>
          <div className="mt-1 text-sm text-neutral-600">
            {fmtMoneyBR(best?.grossCents || 0)} • {fmtInt(best?.salesCount || 0)} vendas • {fmtInt(best?.passengers || 0)} pax
          </div>

          <div className="mt-4 text-sm font-semibold">Vendas por programa (por mês)</div>
          <div className="mt-2 space-y-2">
            {programByMonthBars.slice(-6).map((m: any) => (
              <div key={m.month} className="flex flex-col gap-1 rounded-xl border p-3">
                <div className="text-xs text-neutral-500">{m.month}</div>
                <div className="text-sm">
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                    <span className="h-2 w-2 rounded-full bg-sky-500" /> LATAM:
                  </span>{" "}
                  {fmtMoneyBR(m.LATAM)}{" "}
                  <span className="mx-2 text-neutral-300">|</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> SMILES:
                  </span>{" "}
                  {fmtMoneyBR(m.SMILES)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Funcionários (mês foco) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SimplePieChart
          title={`Distribuição de vendas por funcionário (mês ${monthLabel})`}
          data={byEmployeeMonthPie}
          totalLabel={
            byEmployeeMonthPie.length
              ? `Total do mês: ${fmtMoneyBR(kpis?.gross || 0)}`
              : undefined
          }
        />

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Total por funcionário (mês {monthLabel})</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-neutral-500">
                  <th className="py-2">Funcionário</th>
                  <th className="py-2">Vendas</th>
                  <th className="py-2">PAX</th>
                  <th className="py-2 text-right">Total (sem taxa)</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byEmployee || []).map((r: any, i: number) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-neutral-500">{r.login}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">{fmtInt(r.salesCount)}</td>
                    <td className="py-2">{fmtInt(r.passengers)}</td>
                    <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.grossCents)}</td>
                  </tr>
                ))}
                {!data?.byEmployee?.length ? (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                      Sem vendas no mês foco.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Emissões de balcão (mês foco) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Emissões de balcão por cia (mês {monthLabel})</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-neutral-500">
                  <th className="py-2">CIA</th>
                  <th className="py-2">Ops</th>
                  <th className="py-2">Pontos</th>
                  <th className="py-2 text-right">Valor vendido</th>
                  <th className="py-2 text-right">Lucro líquido</th>
                </tr>
              </thead>
              <tbody>
                {balcaoByAirline.map((r: any) => (
                  <tr key={r.airline} className="border-b">
                    <td className="py-2 font-medium">{String(r.airline || "—").replaceAll("_", " ")}</td>
                    <td className="py-2">{fmtInt(r.operationsCount || 0)}</td>
                    <td className="py-2">{fmtInt(r.points || 0)}</td>
                    <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.customerChargeCents || 0)}</td>
                    <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.netProfitCents || 0)}</td>
                  </tr>
                ))}
                {!balcaoByAirline.length ? (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={5}>
                      Sem emissões de balcão no mês foco.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Emissões de balcão por funcionário (mês {monthLabel})</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-neutral-500">
                  <th className="py-2">Funcionário</th>
                  <th className="py-2">Ops</th>
                  <th className="py-2">Pontos</th>
                  <th className="py-2 text-right">Valor vendido</th>
                  <th className="py-2 text-right">Lucro líquido</th>
                </tr>
              </thead>
              <tbody>
                {balcaoByEmployee.map((r: any) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2">
                      <div className="font-medium">{r.name || "—"}</div>
                      <div className="text-xs text-neutral-500">{r.login || "—"}</div>
                    </td>
                    <td className="py-2">{fmtInt(r.operationsCount || 0)}</td>
                    <td className="py-2">{fmtInt(r.points || 0)}</td>
                    <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.customerChargeCents || 0)}</td>
                    <td className="py-2 text-right font-semibold">{fmtMoneyBR(r.netProfitCents || 0)}</td>
                  </tr>
                ))}
                {!balcaoByEmployee.length ? (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={5}>
                      Sem emissões de balcão no mês foco.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TOP clientes */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold">Clientes que mais compraram</div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={topPeriod}
              onChange={(e) => setTopPeriod(e.target.value as any)}
            >
              <option value="MONTH">Filtrar: mês selecionado</option>
              <option value="TOTAL">Filtrar: total do período</option>
            </select>
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={topProgram}
              onChange={(e) => setTopProgram(e.target.value as any)}
            >
              <option value="ALL">Programa: todos</option>
              <option value="LATAM">Programa: LATAM</option>
              <option value="SMILES">Programa: SMILES</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-neutral-500">
                <th className="py-2">Cliente</th>
                <th className="py-2">Vendas</th>
                <th className="py-2">PAX</th>
                <th className="py-2 text-right">Total (sem taxa)</th>
              </tr>
            </thead>
            <tbody>
              {topClients.map((c: any) => (
                <tr key={c.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-neutral-500">{c.identificador}</div>
                  </td>
                  <td className="py-2">{fmtInt(c.salesCount)}</td>
                  <td className="py-2">{fmtInt(c.passengers)}</td>
                  <td className="py-2 text-right font-semibold">{fmtMoneyBR(c.grossCents)}</td>
                </tr>
              ))}
              {!topClients.length ? (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
