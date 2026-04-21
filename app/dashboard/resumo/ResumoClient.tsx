"use client";

import { useEffect, useMemo, useState } from "react";

type Points = { latam: number; smiles: number; livelo: number; esfera: number };

type Snapshot = {
  id: string;
  date: string;
  createdAt?: string;
  cashCents?: number;
  totalBruto: number;
  totalDividas: number;
  totalLiquido: number;
};

type CreditCard = {
  id: string;
  description: string;
  amountCents: number;
};

type CedenteOpt = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  identificador: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

type BlockRow = {
  id: string;
  status: "OPEN" | "UNBLOCKED" | "CANCELED";
  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  createdAt: string;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  pointsBlocked: number;
  valueBlockedCents: number;
};

type ReceberStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELED";
type DividaAReceberRow = {
  id: string;
  status?: ReceberStatus | string | null;
  totalCents?: number | null;
  receivedCents?: number | null;
};

// ✅ shape do backend (igual ao Caixa Imediato)
type DARResponse = {
  ok: boolean;
  rows?: DividaAReceberRow[];
  totalsAll?: { totalCents: number; receivedCents: number; balanceCents: number };
  totalsOpen?: { totalCents: number; receivedCents: number; balanceCents: number }; // OPEN+PARTIAL
  error?: string;
};

type PendingPointsResponse = {
  ok?: boolean;
  data?: {
    latamPoints: number;
    smilesPoints: number;
    latamCount: number;
    smilesCount: number;
  };
  error?: string;
};

type LatamVisualizarResponse = {
  ok?: boolean;
  rows?: Array<{ latamPendente?: number }>;
  error?: string;
};

type CaixaImediatoResponse = {
  ok?: boolean;
  data?: {
    snapshots?: Snapshot[];
  };
  error?: string;
};

type SnapshotHistoryRow = {
  momentKey: string;
  capturedAt: string;
  resumoTotalLiquidoCents: number | null;
  caixaImediatoTotalLiquidoCents: number | null;
};

type SnapshotChartRange = 30 | 60 | 90 | 180 | 360;
type SnapshotSeriesKey = "resumoTotalLiquidoCents" | "caixaImediatoTotalLiquidoCents";

type SnapshotSeriesStats = {
  latest: number | null;
  min: number | null;
  max: number | null;
};

type SnapshotDayPoint = {
  dayKey: string;
  label: string;
  capturedAt: string;
  rows: SnapshotHistoryRow[];
  resumo: SnapshotSeriesStats;
  caixaImediato: SnapshotSeriesStats;
};

const FIXED_CUTOFF_POINTS = 3000;

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
function dateTimeBR(raw: string) {
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw || "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function timeBR(raw: string) {
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw || "-";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function snapshotDayKey(raw: string) {
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dayLabelBR(dayKey: string) {
  const [y, m, d] = dayKey.split("-");
  if (!y || !m || !d) return dayKey;
  return `${d}/${m}/${y}`;
}
function snapshotMomentKey(snapshot: Snapshot) {
  const raw = snapshot.date || snapshot.createdAt || "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw || snapshot.id;
  return d.toISOString();
}
function snapshotCutoffISO(days: SnapshotChartRange) {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function centsToRateInput(cents: number) {
  const v = (Number(cents || 0) / 100).toFixed(2);
  return v.replace(".", ",");
}

function snapshotStats(rows: SnapshotHistoryRow[], key: SnapshotSeriesKey): SnapshotSeriesStats {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!values.length) return { latest: null, min: null, max: null };

  return {
    latest: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function SnapshotEvolutionChart({
  rows,
  range,
}: {
  rows: SnapshotHistoryRow[];
  range: SnapshotChartRange;
}) {
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const rawData = useMemo(() => {
    const cutoff = snapshotCutoffISO(range);
    return [...rows]
      .filter((row) => row.capturedAt >= cutoff)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }, [rows, range]);

  const data = useMemo<SnapshotDayPoint[]>(() => {
    const byDay = new Map<string, SnapshotHistoryRow[]>();

    for (const row of rawData) {
      const dayKey = snapshotDayKey(row.capturedAt);
      const bucket = byDay.get(dayKey) || [];
      bucket.push(row);
      byDay.set(dayKey, bucket);
    }

    return Array.from(byDay.entries()).map(([dayKey, dayRows]) => {
      const sortedRows = [...dayRows].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      const latest = sortedRows[sortedRows.length - 1];

      return {
        dayKey,
        label: dayLabelBR(dayKey),
        capturedAt: latest?.capturedAt || dayKey,
        rows: sortedRows,
        resumo: snapshotStats(sortedRows, "resumoTotalLiquidoCents"),
        caixaImediato: snapshotStats(sortedRows, "caixaImediatoTotalLiquidoCents"),
      };
    });
  }, [rawData]);

  const hasValues = data.some(
    (day) => day.resumo.latest != null || day.caixaImediato.latest != null
  );

  if (!data.length || !hasValues) {
    return (
      <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
        Sem snapshots manuais nos últimos {range} dias.
      </div>
    );
  }

  const width = 940;
  const height = 356;
  const padLeft = 86;
  const padRight = 34;
  const padTop = 30;
  const padBottom = 42;
  const laneGap = 30;
  const laneH = (height - padTop - padBottom - laneGap) / 2;
  const plotW = width - padLeft - padRight;
  const xPad = 22;
  const plotInnerW = plotW - xPad * 2;

  const lanes = [
    {
      key: "resumo" as const,
      label: "Resumo",
      color: "#0ea5e9",
      dark: "#0369a1",
      fill: "#f0f9ff",
      y: padTop,
    },
    {
      key: "caixaImediato" as const,
      label: "Caixa imediato",
      color: "#10b981",
      dark: "#047857",
      fill: "#ecfdf5",
      y: padTop + laneH + laneGap,
    },
  ];

  function seriesValues(key: "resumo" | "caixaImediato") {
    return data
      .flatMap((day) => [day[key].latest, day[key].min, day[key].max])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  }

  function scaleFor(key: "resumo" | "caixaImediato") {
    const values = seriesValues(key);
    if (!values.length) return { min: 0, max: 1, span: 1 };

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawSpan = Math.max(1, rawMax - rawMin);
    const pad = Math.max(1000, Math.round(rawSpan * 0.18), Math.round(Math.abs(rawMax) * 0.004));
    const min = rawMin - pad;
    const max = rawMax + pad;
    return { min, max, span: Math.max(1, max - min) };
  }

  const scales = {
    resumo: scaleFor("resumo"),
    caixaImediato: scaleFor("caixaImediato"),
  };

  const xFor = (idx: number) =>
    padLeft +
    xPad +
    (data.length <= 1 ? plotInnerW / 2 : (idx / (data.length - 1)) * plotInnerW);
  const yFor = (
    value: number,
    lane: (typeof lanes)[number],
    scale: { min: number; max: number; span: number }
  ) => lane.y + ((scale.max - value) / scale.span) * laneH;

  const buildPath = (
    key: "resumo" | "caixaImediato",
    lane: (typeof lanes)[number],
    scale: { min: number; max: number; span: number }
  ) => {
    let path = "";
    data.forEach((day, idx) => {
      const value = day[key].latest;
      if (value == null) return;
      const cmd = path ? "L" : "M";
      path += `${cmd}${xFor(idx).toFixed(1)},${yFor(value, lane, scale).toFixed(1)} `;
    });
    return path.trim();
  };

  const resumoPath = buildPath("resumo", lanes[0], scales.resumo);
  const caixaPath = buildPath("caixaImediato", lanes[1], scales.caixaImediato);
  const latest = data[data.length - 1];
  const selectedDay = selectedDayKey ? data.find((day) => day.dayKey === selectedDayKey) || null : null;
  const xLabelStep = Math.max(1, Math.ceil(data.length / 6));

  const dayTitle = (day: SnapshotDayPoint) => {
    const resumoRange =
      day.resumo.min == null || day.resumo.max == null
        ? "Resumo: sem valor"
        : `Resumo: ultimo ${fmtMoneyBR(day.resumo.latest || 0)} | min ${fmtMoneyBR(day.resumo.min)} | max ${fmtMoneyBR(
            day.resumo.max
          )}`;
    const caixaRange =
      day.caixaImediato.min == null || day.caixaImediato.max == null
        ? "Caixa imediato: sem valor"
        : `Caixa imediato: ultimo ${fmtMoneyBR(day.caixaImediato.latest || 0)} | min ${fmtMoneyBR(
            day.caixaImediato.min
          )} | max ${fmtMoneyBR(day.caixaImediato.max)}`;

    return `${day.label}\n${day.rows.length} medicao(oes)\n${resumoRange}\n${caixaRange}`;
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Evolução dos snapshots manuais</div>
          <div className="text-xs text-slate-500">
            {data.length} dia(s), {rawData.length} medição(ões) em {range} dias • último: {dateTimeBR(latest.capturedAt)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-sky-700">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> Resumo
            <b>{latest.resumo.latest == null ? "—" : fmtMoneyBR(latest.resumo.latest)}</b>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Caixa imediato
            <b>{latest.caixaImediato.latest == null ? "—" : fmtMoneyBR(latest.caixaImediato.latest)}</b>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px]">
          <defs>
            <filter id="snapshot-dot-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.16" />
            </filter>
          </defs>

          {lanes.map((lane) => {
            const scale = scales[lane.key];
            const ticks = [scale.max, (scale.max + scale.min) / 2, scale.min];
            return (
              <g key={lane.key}>
                <rect
                  x={padLeft}
                  y={lane.y - 12}
                  width={plotW}
                  height={laneH + 24}
                  rx="14"
                  fill={lane.fill}
                  stroke="#e2e8f0"
                />
                <text x={padLeft + 14} y={lane.y + 8} className="fill-slate-700 text-[12px] font-semibold">
                  {lane.label}
                </text>
                {ticks.map((tick) => {
                  const y = yFor(tick, lane, scale);
                  return (
                    <g key={`${lane.key}-${tick}`}>
                      <line
                        x1={padLeft + 16}
                        y1={y}
                        x2={padLeft + plotW - 16}
                        y2={y}
                        stroke="#cbd5e1"
                        strokeOpacity="0.65"
                        strokeDasharray="4 6"
                      />
                      <text x={padLeft - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                        {fmtMoneyBR(Math.round(tick))}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {data.map((day, idx) => {
            const x = xFor(idx);
            const selected = selectedDayKey === day.dayKey;
            return (
              <g key={`${day.dayKey}-guide`}>
                {selected ? (
                  <line
                    x1={x}
                    y1={padTop - 12}
                    x2={x}
                    y2={padTop + laneH * 2 + laneGap + 12}
                    stroke="#0f172a"
                    strokeOpacity="0.18"
                    strokeDasharray="3 5"
                  />
                ) : null}
              </g>
            );
          })}

          {lanes.map((lane) => {
            const path = lane.key === "resumo" ? resumoPath : caixaPath;
            return path ? (
              <path
                key={`${lane.key}-path`}
                d={path}
                fill="none"
                stroke={lane.color}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null;
          })}

          {data.map((day, idx) => {
            const x = xFor(idx);
            const selected = selectedDayKey === day.dayKey;
            return (
              <g
                key={day.dayKey}
                role="button"
                tabIndex={0}
                className="cursor-pointer outline-none"
                onClick={() => setSelectedDayKey(day.dayKey)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedDayKey(day.dayKey);
                  }
                }}
              >
                <title>{dayTitle(day)}</title>
                <rect x={x - 18} y={padTop - 16} width="36" height={laneH * 2 + laneGap + 32} fill="transparent" />
                {lanes.map((lane) => {
                  const stats = day[lane.key];
                  const scale = scales[lane.key];
                  if (stats.min == null || stats.max == null || stats.latest == null) return null;

                  const yMin = yFor(stats.min, lane, scale);
                  const yMax = yFor(stats.max, lane, scale);
                  const yLatest = yFor(stats.latest, lane, scale);

                  return (
                    <g key={`${day.dayKey}-${lane.key}`}>
                      <line
                        x1={x}
                        y1={yMax}
                        x2={x}
                        y2={yMin}
                        stroke={lane.color}
                        strokeWidth={selected ? "10" : "7"}
                        strokeOpacity={selected ? "0.28" : "0.18"}
                        strokeLinecap="round"
                      />
                      <circle
                        cx={x}
                        cy={yLatest}
                        r={selected ? "6.2" : "4.8"}
                        fill={lane.color}
                        stroke="#ffffff"
                        strokeWidth="2.5"
                        filter="url(#snapshot-dot-shadow)"
                      />
                      {selected ? (
                        <circle
                          cx={x}
                          cy={yLatest}
                          r="9"
                          fill="none"
                          stroke={lane.dark}
                          strokeOpacity="0.28"
                          strokeWidth="2"
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {data.map((day, idx) => {
            if (idx !== 0 && idx !== data.length - 1 && idx % xLabelStep !== 0) return null;
            const x = xFor(idx);
            return (
              <text
                key={`${day.dayKey}-label`}
                x={x}
                y={height - 16}
                textAnchor={idx === 0 ? "start" : idx === data.length - 1 ? "end" : "middle"}
                className="fill-slate-500 text-[11px]"
              >
                {idx === 0 || idx === data.length - 1 ? day.label : day.label.slice(0, 5)}
              </text>
            );
          })}
        </svg>
      </div>

      {selectedDay ? (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{selectedDay.label}</div>
              <div className="text-xs text-slate-500">
                {selectedDay.rows.length} medição(ões) • último ponto: {timeBR(selectedDay.capturedAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDayKey(null)}
              className="rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              Fechar
            </button>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <div className="border-l-4 border-sky-500 pl-3 text-xs">
              <div className="font-medium text-sky-700">Resumo</div>
              <div className="text-slate-600">
                último {selectedDay.resumo.latest == null ? "—" : fmtMoneyBR(selectedDay.resumo.latest)} • mín{" "}
                {selectedDay.resumo.min == null ? "—" : fmtMoneyBR(selectedDay.resumo.min)} • máx{" "}
                {selectedDay.resumo.max == null ? "—" : fmtMoneyBR(selectedDay.resumo.max)}
              </div>
            </div>
            <div className="border-l-4 border-emerald-500 pl-3 text-xs">
              <div className="font-medium text-emerald-700">Caixa imediato</div>
              <div className="text-slate-600">
                último {selectedDay.caixaImediato.latest == null ? "—" : fmtMoneyBR(selectedDay.caixaImediato.latest)} •
                mín {selectedDay.caixaImediato.min == null ? "—" : fmtMoneyBR(selectedDay.caixaImediato.min)} • máx{" "}
                {selectedDay.caixaImediato.max == null ? "—" : fmtMoneyBR(selectedDay.caixaImediato.max)}
              </div>
            </div>
          </div>

          <div className="max-h-56 overflow-auto rounded-lg border bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="px-2 py-1.5 text-left">Hora</th>
                  <th className="px-2 py-1.5 text-right">Resumo</th>
                  <th className="px-2 py-1.5 text-right">Caixa imediato</th>
                </tr>
              </thead>
              <tbody>
                {[...selectedDay.rows].reverse().map((row) => (
                  <tr key={row.momentKey} className="border-t">
                    <td className="px-2 py-1.5">{timeBR(row.capturedAt)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {row.resumoTotalLiquidoCents == null ? "—" : fmtMoneyBR(row.resumoTotalLiquidoCents)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {row.caixaImediatoTotalLiquidoCents == null ? "—" : fmtMoneyBR(row.caixaImediatoTotalLiquidoCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1">
      <div className="text-xs text-slate-600">{label}</div>
      <input
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Line({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "plus" | "minus";
}) {
  const vCls =
    tone === "plus"
      ? "font-semibold text-emerald-700"
      : tone === "minus"
      ? "font-semibold text-rose-700"
      : "font-semibold text-slate-900";

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm text-slate-700">{label}</div>
        {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className={`shrink-0 text-sm ${vCls}`}>{value}</div>
    </div>
  );
}

// ✅ fallback (caso totalsOpen não venha)
function computeDividasAReceberOpenCents(list: DividaAReceberRow[]) {
  let sum = 0;

  for (const r of list || []) {
    const status = String(r?.status || "").toUpperCase();
    if (status === "CANCELED") continue; // ignora canceladas

    const total = Math.max(0, Number(r?.totalCents ?? 0) || 0);
    const received = Math.max(0, Number(r?.receivedCents ?? 0) || 0);
    const remaining = total - received;

    if (remaining > 0) sum += remaining;
  }

  return sum;
}

export default function CedentesResumoClient() {
  const [loading, setLoading] = useState(false);

  const [points, setPoints] = useState<Points>({
    latam: 0,
    smiles: 0,
    livelo: 0,
    esfera: 0,
  });

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [caixaImediatoSnapshots, setCaixaImediatoSnapshots] = useState<Snapshot[]>([]);
  const [snapshotChartRange, setSnapshotChartRange] = useState<SnapshotChartRange>(30);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [creditCardDescription, setCreditCardDescription] = useState("");
  const [creditCardAmount, setCreditCardAmount] = useState("");
  const [savingCreditCard, setSavingCreditCard] = useState(false);
  const [cedentes, setCedentes] = useState<CedenteOpt[]>([]);
  const [blockedRows, setBlockedRows] = useState<BlockRow[]>([]);

  const [debtsOpenCents, setDebtsOpenCents] = useState<number>(0);

  // ✅ comissões pendentes (cedentes)
  const [pendingCedenteCommissionsCents, setPendingCedenteCommissionsCents] = useState<number>(0);

  // ✅ recebimentos em aberto (A RECEBER - vendas)
  const [receivablesOpenCents, setReceivablesOpenCents] = useState<number>(0);

  // ✅ dívidas a receber (OPEN+PARTIAL pelo totalsOpen.balanceCents)
  const [dividasAReceberOpenCents, setDividasAReceberOpenCents] = useState<number>(0);

  // ✅ a pagar funcionários (pendente)
  const [employeePayoutsPendingCents, setEmployeePayoutsPendingCents] = useState<number>(0);

  // ✅ impostos pendentes (mês não pago)
  const [taxesPendingCents, setTaxesPendingCents] = useState<number>(0);

  // ✅ pontos pendentes de compras OPEN (para caixa imediato)
  const [pendingPurchaseLatamPoints, setPendingPurchaseLatamPoints] = useState(0);
  const [pendingPurchaseSmilesPoints, setPendingPurchaseSmilesPoints] = useState(0);
  const [pendingPurchaseLatamCount, setPendingPurchaseLatamCount] = useState(0);
  const [pendingPurchaseSmilesCount, setPendingPurchaseSmilesCount] = useState(0);

  // ✅ opcional: se o backend mandar pronto, usamos (senão calculamos)
  const [rateLatam, setRateLatam] = useState("20,00");
  const [rateSmiles, setRateSmiles] = useState("18,00");
  const [rateLivelo, setRateLivelo] = useState("22,00");
  const [rateEsfera, setRateEsfera] = useState("17,00");

  const [didLoad, setDidLoad] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rResumo, rDAR, rCedentes, rBloq, rPendingPts, rLatamVisualizar, rCaixaImediato] = await Promise.all([
        fetch("/api/resumo", { cache: "no-store" }),
        // ✅ se teu endpoint suportar, pode reduzir payload (totalsOpen continua vindo)
        fetch("/api/dividas-a-receber?take=1", { cache: "no-store" }),
        fetch("/api/cedentes/options", { cache: "no-store" }),
        fetch("/api/bloqueios", { cache: "no-store" }),
        fetch("/api/compras/pending-points", { cache: "no-store" }),
        fetch("/api/cedentes/latam", { cache: "no-store" }),
        fetch("/api/caixa-imediato", { cache: "no-store" }),
      ]);

      const j = await rResumo.json();
      const jDAR = (await rDAR.json()) as DARResponse;
      const jCed = await rCedentes.json();
      const jBloq = await rBloq.json();
      const jPending = (await rPendingPts.json()) as PendingPointsResponse;
      const jLatam = (await rLatamVisualizar.json()) as LatamVisualizarResponse;
      const jCaixaImediato = (await rCaixaImediato.json()) as CaixaImediatoResponse;

      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar resumo");
      if (!jDAR?.ok) throw new Error(jDAR?.error || "Erro ao carregar dívidas a receber");
      if (!jCed?.ok) throw new Error(jCed?.error || "Erro ao carregar cedentes");
      if (!jBloq?.ok) throw new Error(jBloq?.error || "Erro ao carregar bloqueios");
      if (!jPending?.ok) throw new Error(jPending?.error || "Erro ao carregar pontos pendentes");
      if (!jCaixaImediato?.ok) throw new Error(jCaixaImediato?.error || "Erro ao carregar caixa imediato");

      setPoints(j.data.points);
      setSnapshots(j.data.snapshots);
      setCaixaImediatoSnapshots(jCaixaImediato.data?.snapshots || []);
      setCreditCards(Array.isArray(j.data.creditCards) ? j.data.creditCards : []);
      setCedentes(jCed.data || []);
      setBlockedRows(jBloq.data?.rows || []);

      const rates = j.data.ratesCents;
      if (rates) {
        setRateLatam(centsToRateInput(rates.latamRateCents));
        setRateSmiles(centsToRateInput(rates.smilesRateCents));
        setRateLivelo(centsToRateInput(rates.liveloRateCents));
        setRateEsfera(centsToRateInput(rates.esferaRateCents));
      }

      setDebtsOpenCents(Number(j.data.debtsOpenCents || 0));
      setPendingCedenteCommissionsCents(Number(j.data.pendingCedenteCommissionsCents || 0));
      setReceivablesOpenCents(Number(j.data.receivablesOpenCents || 0));

      setEmployeePayoutsPendingCents(Number(j.data.employeePayoutsPendingCents || 0));
      setTaxesPendingCents(Number(j.data.taxesPendingCents || 0));

      /**
       * ✅ DÍVIDAS A RECEBER:
       * Igual ao Caixa Imediato:
       * usa totalsOpen.balanceCents (OPEN+PARTIAL).
       * Se não vier, faz fallback pelos rows.
       */
      const darOpen = Number(jDAR?.totalsOpen?.balanceCents ?? NaN);
      if (Number.isFinite(darOpen)) {
        setDividasAReceberOpenCents(darOpen);
      } else {
        const rows = Array.isArray(jDAR?.rows) ? jDAR.rows : [];
        setDividasAReceberOpenCents(computeDividasAReceberOpenCents(rows));
      }

      const pendingLatamFromCompras = Number(jPending.data?.latamPoints || 0);
      const pendingLatamCountFromCompras = Number(jPending.data?.latamCount || 0);

      let pendingLatamFromVisualizar = 0;
      let pendingLatamCountFromVisualizar = 0;
      if (rLatamVisualizar.ok && jLatam?.ok && Array.isArray(jLatam.rows)) {
        pendingLatamFromVisualizar = jLatam.rows.reduce(
          (acc, row) => acc + Number(row?.latamPendente || 0),
          0
        );
        pendingLatamCountFromVisualizar = jLatam.rows.filter(
          (row) => Number(row?.latamPendente || 0) > 0
        ).length;
      }

      const shouldUseLatamVisualizarFallback =
        pendingLatamFromCompras <= 0 && pendingLatamFromVisualizar > 0;

      if (shouldUseLatamVisualizarFallback) {
        setPendingPurchaseLatamPoints(pendingLatamFromVisualizar);
        setPendingPurchaseLatamCount(pendingLatamCountFromVisualizar);
      } else {
        setPendingPurchaseLatamPoints(pendingLatamFromCompras);
        setPendingPurchaseLatamCount(pendingLatamCountFromCompras);
      }

      setPendingPurchaseSmilesPoints(Number(jPending.data?.smilesPoints || 0));
      setPendingPurchaseSmilesCount(Number(jPending.data?.smilesCount || 0));

      setDidLoad(true);
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao carregar resumo"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function salvarRates() {
    const res = await fetch("/api/resumo/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latam: rateLatam,
        smiles: rateSmiles,
        livelo: rateLivelo,
        esfera: rateEsfera,
      }),
    });
    const j = await res.json();
    if (!j?.ok) throw new Error(j?.error || "Erro ao salvar milheiros");
  }

  useEffect(() => {
    if (!didLoad) return;
    const t = setTimeout(() => {
      salvarRates().catch(() => {});
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateLatam, rateSmiles, rateLivelo, rateEsfera, didLoad]);

  const blockedTotals = useMemo(() => {
    const open = blockedRows.filter((r) => r.status === "OPEN");
    const openCount = open.length;
    const valueBlockedCents = open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0);
    return { openCount, valueBlockedCents };
  }, [blockedRows]);

  const eligible = useMemo(() => {
    const cutoff = FIXED_CUTOFF_POINTS;

    const pts: Points = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    const counts = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };

    for (const c of cedentes) {
      const pLatam = Number(c.pontosLatam || 0);
      const pSmiles = Number(c.pontosSmiles || 0);
      const pLivelo = Number(c.pontosLivelo || 0);
      const pEsfera = Number(c.pontosEsfera || 0);

      if (pLatam >= cutoff) {
        pts.latam += pLatam;
        counts.latam += 1;
      }
      if (pSmiles >= cutoff) {
        pts.smiles += pSmiles;
        counts.smiles += 1;
      }
      if (pLivelo >= cutoff) {
        pts.livelo += pLivelo;
        counts.livelo += 1;
      }
      if (pEsfera >= cutoff) {
        pts.esfera += pEsfera;
        counts.esfera += 1;
      }
    }

    return { cutoff, pts, counts };
  }, [cedentes]);

  const creditCardsTotalCents = useMemo(
    () => creditCards.reduce((sum, card) => sum + Number(card.amountCents || 0), 0),
    [creditCards]
  );

  async function addCreditCard() {
    const description = creditCardDescription.trim();
    const amountCents = toCentsFromInput(creditCardAmount);

    if (!description) {
      alert("Informe a descrição do cartão.");
      return;
    }
    if (amountCents < 0) {
      alert("Informe um valor válido para o cartão.");
      return;
    }

    try {
      setSavingCreditCard(true);
      const res = await fetch("/api/resumo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amountCents,
        }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao adicionar cartão.");

      setCreditCardDescription("");
      setCreditCardAmount("");
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao adicionar cartão."));
    } finally {
      setSavingCreditCard(false);
    }
  }

  async function removeCreditCard(id: string) {
    try {
      setSavingCreditCard(true);
      const res = await fetch(`/api/resumo/cards?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao remover cartão.");

      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao remover cartão."));
    } finally {
      setSavingCreditCard(false);
    }
  }

  const caixaImediatoCalc = useMemo(() => {
    const milLatam = Math.floor((eligible.pts.latam || 0) / 1000);
    const milSmiles = Math.floor((eligible.pts.smiles || 0) / 1000);
    const milLivelo = Math.floor((eligible.pts.livelo || 0) / 1000);
    const milEsfera = Math.floor((eligible.pts.esfera || 0) / 1000);

    const rateLatamCents = Math.round((Number(String(rateLatam).replace(",", ".")) || 0) * 100);
    const rateSmilesCents = Math.round((Number(String(rateSmiles).replace(",", ".")) || 0) * 100);
    const rateLiveloCents = Math.round((Number(String(rateLivelo).replace(",", ".")) || 0) * 100);
    const rateEsferaCents = Math.round((Number(String(rateEsfera).replace(",", ".")) || 0) * 100);

    const milesValueEligibleCents =
      milLatam * rateLatamCents +
      milSmiles * rateSmilesCents +
      milLivelo * rateLiveloCents +
      milEsfera * rateEsferaCents;

    const pendingLatamMil = Math.floor((pendingPurchaseLatamPoints || 0) / 1000);
    const pendingSmilesMil = Math.floor((pendingPurchaseSmilesPoints || 0) / 1000);

    const pendingLatamValueCents = pendingLatamMil * rateLatamCents;
    const pendingSmilesValueCents = pendingSmilesMil * rateSmilesCents;
    const pendingPurchasesValueCents = pendingLatamValueCents + pendingSmilesValueCents;

    const cashCents = 0;
    const cashAndCardsCents = creditCardsTotalCents;
    const receivableSalesCents = Number(receivablesOpenCents || 0);
    const receivableDARcents = Number(dividasAReceberOpenCents || 0);

    const totalGrossCents =
      milesValueEligibleCents +
      pendingPurchasesValueCents +
      cashAndCardsCents +
      receivableSalesCents +
      receivableDARcents;

    const outCents =
      (debtsOpenCents || 0) +
      (blockedTotals.valueBlockedCents || 0) +
      (pendingCedenteCommissionsCents || 0) +
      (employeePayoutsPendingCents || 0) +
      (taxesPendingCents || 0);

    const totalImmediateCents = totalGrossCents - outCents;

    const cashProjectedInterCents =
      cashAndCardsCents +
      receivableSalesCents +
      receivableDARcents -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    return {
      milLatam,
      milSmiles,
      milLivelo,
      milEsfera,
      milesValueEligibleCents,
      pendingLatamMil,
      pendingSmilesMil,
      pendingLatamValueCents,
      pendingSmilesValueCents,
      pendingPurchasesValueCents,
      cashCents,
      cashAndCardsCents,
      receivableSalesCents,
      receivableDARcents,
      totalGrossCents,
      outCents,
      totalImmediateCents,
      cashProjectedInterCents,
    };
  }, [
    eligible,
    rateLatam,
    rateSmiles,
    rateLivelo,
    rateEsfera,
    pendingPurchaseLatamPoints,
    pendingPurchaseSmilesPoints,
    creditCardsTotalCents,
    receivablesOpenCents,
    dividasAReceberOpenCents,
    debtsOpenCents,
    blockedTotals.valueBlockedCents,
    pendingCedenteCommissionsCents,
    employeePayoutsPendingCents,
    taxesPendingCents,
  ]);

  const calc = useMemo(() => {
    const milLatam = Math.floor((points.latam || 0) / 1000);
    const milSmiles = Math.floor((points.smiles || 0) / 1000);
    const milLivelo = Math.floor((points.livelo || 0) / 1000);
    const milEsfera = Math.floor((points.esfera || 0) / 1000);

    const rLatam = Number(String(rateLatam).replace(",", ".")) || 0;
    const rSmiles = Number(String(rateSmiles).replace(",", ".")) || 0;
    const rLivelo = Number(String(rateLivelo).replace(",", ".")) || 0;
    const rEsfera = Number(String(rateEsfera).replace(",", ".")) || 0;

    const vLatamCents = Math.round(milLatam * rLatam * 100);
    const vSmilesCents = Math.round(milSmiles * rSmiles * 100);
    const vLiveloCents = Math.round(milLivelo * rLivelo * 100);
    const vEsferaCents = Math.round(milEsfera * rEsfera * 100);

    const pendingLatamMil = Math.floor((pendingPurchaseLatamPoints || 0) / 1000);
    const pendingSmilesMil = Math.floor((pendingPurchaseSmilesPoints || 0) / 1000);
    const pendingLatamValueCents = Math.round(pendingLatamMil * rLatam * 100);
    const pendingSmilesValueCents = Math.round(pendingSmilesMil * rSmiles * 100);
    const pendingPurchasesValueCents = pendingLatamValueCents + pendingSmilesValueCents;

    const cashCents = 0;
    const cashAndCardsCents = creditCardsTotalCents;

    const receivableSalesCents = Number(receivablesOpenCents || 0);
    const receivableDARcents = Number(dividasAReceberOpenCents || 0);

    const totalGrossCents =
      vLatamCents +
      vSmilesCents +
      vLiveloCents +
      vEsferaCents +
      pendingPurchasesValueCents +
      cashAndCardsCents +
      receivableSalesCents +
      receivableDARcents;

    const totalNetCents = totalGrossCents - (debtsOpenCents || 0);

    const totalAfterPendingsCents =
      totalNetCents -
      (pendingCedenteCommissionsCents || 0) -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    const cashProjectedCents =
      cashAndCardsCents +
      receivableSalesCents +
      receivableDARcents -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    return {
      milLatam,
      milSmiles,
      milLivelo,
      milEsfera,
      vLatamCents,
      vSmilesCents,
      vLiveloCents,
      vEsferaCents,
      pendingLatamMil,
      pendingSmilesMil,
      pendingLatamValueCents,
      pendingSmilesValueCents,
      pendingPurchasesValueCents,
      cashCents,
      cashAndCardsCents,

      receivableSalesCents,
      receivableDARcents,

      totalGrossCents,
      totalNetCents,
      totalAfterPendingsCents,
      cashProjectedCents,
    };
  }, [
    points,
    rateLatam,
    rateSmiles,
    rateLivelo,
    rateEsfera,
    pendingPurchaseLatamPoints,
    pendingPurchaseSmilesPoints,
    creditCardsTotalCents,
    debtsOpenCents,
    pendingCedenteCommissionsCents,
    receivablesOpenCents,
    dividasAReceberOpenCents,
    employeePayoutsPendingCents,
    taxesPendingCents,
  ]);

  const snapshotRows = useMemo(() => {
    const byDate = new Map<
      string,
      SnapshotHistoryRow
    >();

    for (const s of snapshots) {
      const momentKey = snapshotMomentKey(s);
      if (!momentKey) continue;
      const row = byDate.get(momentKey) || {
        momentKey,
        capturedAt: momentKey,
        resumoTotalLiquidoCents: null,
        caixaImediatoTotalLiquidoCents: null,
      };
      row.resumoTotalLiquidoCents = Number(s.totalLiquido || 0);
      byDate.set(momentKey, row);
    }

    for (const s of caixaImediatoSnapshots) {
      const momentKey = snapshotMomentKey(s);
      if (!momentKey) continue;
      const row = byDate.get(momentKey) || {
        momentKey,
        capturedAt: momentKey,
        resumoTotalLiquidoCents: null,
        caixaImediatoTotalLiquidoCents: null,
      };
      row.caixaImediatoTotalLiquidoCents = Number(s.totalLiquido || 0);
      byDate.set(momentKey, row);
    }

    return Array.from(byDate.values())
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
      .slice(0, 500);
  }, [snapshots, caixaImediatoSnapshots]);

  async function salvarSnapshotsHoje() {
    try {
      const capturedAt = new Date().toISOString();
      const resumoSaidasCents =
        (debtsOpenCents || 0) +
        (pendingCedenteCommissionsCents || 0) +
        (employeePayoutsPendingCents || 0) +
        (taxesPendingCents || 0);

      const [resResumo, resCaixaImediato] = await Promise.all([
        fetch("/api/resumo/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capturedAt,
            cashCents: calc.cashCents,
            totalBrutoCents: calc.totalGrossCents,
            totalDividasCents: resumoSaidasCents,
            totalLiquidoCents: calc.totalAfterPendingsCents,
          }),
        }),
        fetch("/api/caixa-imediato/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capturedAt,
            cashCents: caixaImediatoCalc.cashCents,
            cutoffPoints: eligible.cutoff,
            totalBrutoCents: caixaImediatoCalc.totalGrossCents,
            totalDividasCents: caixaImediatoCalc.outCents,
            totalLiquidoCents: caixaImediatoCalc.totalImmediateCents,
          }),
        }),
      ]);

      const [jResumo, jCaixaImediato] = await Promise.all([
        resResumo.json().catch(() => null),
        resCaixaImediato.json().catch(() => null),
      ]);
      if (!jResumo?.ok) throw new Error(jResumo?.error || "Erro ao salvar snapshot do resumo");
      if (!jCaixaImediato?.ok) throw new Error(jCaixaImediato?.error || "Erro ao salvar snapshot do caixa imediato");

      await load();
      alert("✅ Snapshot manual do resumo e do caixa imediato salvo!");
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao salvar snapshots."));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resumo</h1>
          <p className="text-sm text-slate-600">
            Patrimônio estimado: milhas (por milheiro) + saldos + a receber (vendas) + dívidas a receber −
            dívidas − pendências (comissões/funcionários/impostos).
          </p>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Top cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Milhas */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Milhas atuais</div>
            <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              somatório cedentes
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>
              LATAM: <b>{fmtInt(points.latam)}</b>
            </div>
            <div>
              Smiles: <b>{fmtInt(points.smiles)}</b>
            </div>
            <div>
              Livelo: <b>{fmtInt(points.livelo)}</b>
            </div>
            <div>
              Esfera: <b>{fmtInt(points.esfera)}</b>
            </div>
          </div>

          <div className="text-xs text-slate-600">
            * cálculo usa milheiros inteiros (pontos/1000 arredondado para baixo).
          </div>
        </div>

        {/* Caixa */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Caixa (saldos)</div>
            <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              referência operacional
            </span>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Saldos</div>
                <div className="text-xs text-slate-500">Adicione e remova saldos disponíveis para compor o caixa.</div>
              </div>
              <div className="text-sm font-semibold text-slate-900">{fmtMoneyBR(creditCardsTotalCents)}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
              <Input
                label="Descrição"
                value={creditCardDescription}
                onChange={setCreditCardDescription}
                placeholder="Ex: Inter / Nubank final 1234 / Caixa Lucas"
              />
              <Input
                label="Valor disponível (R$)"
                value={creditCardAmount}
                onChange={setCreditCardAmount}
                placeholder="Ex: 1500,00"
              />
              <button
                onClick={addCreditCard}
                disabled={savingCreditCard}
                className="self-end rounded-xl border px-4 py-2 text-sm hover:bg-white disabled:opacity-60"
              >
                {savingCreditCard ? "Salvando..." : "Adicionar saldo"}
              </button>
            </div>

            {creditCards.length ? (
              <div className="space-y-2">
                {creditCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{card.description}</div>
                      <div className="text-xs text-slate-500">Saldo disponível</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-slate-900">{fmtMoneyBR(card.amountCents)}</div>
                      <button
                        onClick={() => removeCreditCard(card.id)}
                        disabled={savingCreditCard}
                        className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">Nenhum saldo cadastrado ainda.</div>
            )}
          </div>

          <div className="text-xs text-slate-600">
            Ponto de corte fixo para caixa imediato: <b>{fmtInt(FIXED_CUTOFF_POINTS)} pts</b>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Caixa projetado</div>
            <div className="text-xl font-bold">{fmtMoneyBR(caixaImediatoCalc.cashProjectedInterCents)}</div>
            <div className="text-xs text-slate-500 mt-1">
              saldos + a receber (vendas) + dívidas a receber − (a pagar funcionários + impostos)
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Caixa total (sem corte)</div>
            <div className="text-xl font-bold">{fmtMoneyBR(calc.totalAfterPendingsCents)}</div>
            <div className="text-xs text-slate-500 mt-1">
              milhas totais + pontos pendentes + saldos + a receber − dívidas − pendências
            </div>
          </div>

          <div className="text-xs text-slate-600">
            Elegíveis no corte: LATAM {fmtInt(eligible.counts.latam)} • Smiles {fmtInt(eligible.counts.smiles)} •
            Livelo {fmtInt(eligible.counts.livelo)} • Esfera {fmtInt(eligible.counts.esfera)}
          </div>
        </div>
      </div>

      {/* Milheiro */}
      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">Valor do milheiro</div>
            <div className="text-xs text-slate-600">R$/1000</div>
          </div>

          <button
            onClick={async () => {
              try {
                await salvarRates();
                alert("✅ Milheiros salvos!");
              } catch (e: unknown) {
                alert(getErrorMessage(e, "Erro ao salvar milheiros."));
              }
            }}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Salvar milheiros
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="LATAM" value={rateLatam} onChange={setRateLatam} />
          <Input label="Smiles" value={rateSmiles} onChange={setRateSmiles} />
          <Input label="Livelo" value={rateLivelo} onChange={setRateLivelo} />
          <Input label="Esfera" value={rateEsfera} onChange={setRateEsfera} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">LATAM</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milLatam)}</b> • Valor: <b>{fmtMoneyBR(calc.vLatamCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Smiles</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milSmiles)}</b> • Valor: <b>{fmtMoneyBR(calc.vSmilesCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Livelo</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milLivelo)}</b> • Valor: <b>{fmtMoneyBR(calc.vLiveloCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Esfera</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milEsfera)}</b> • Valor: <b>{fmtMoneyBR(calc.vEsferaCents)}</b>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Caixa imediato (integrado)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Entradas e saídas consolidadas em lista para leitura rápida.
              </div>
            </div>
            <button
              onClick={salvarSnapshotsHoje}
              className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
            >
              Salvar snapshot manual
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Entradas</div>
                <div className="text-xs text-slate-600">
                  Total: <b className="text-emerald-700">+{fmtMoneyBR(caixaImediatoCalc.totalGrossCents)}</b>
                </div>
              </div>
              <div className="mt-3 divide-y">
                <Line
                  label="Milhas elegíveis (valor estimado)"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.milesValueEligibleCents)}`}
                  tone="plus"
                  hint={`milheiros inteiros • corte ${fmtInt(eligible.cutoff)}`}
                />
                <Line
                  label="Pontos pendentes (compras OPEN) — LATAM"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.pendingLatamValueCents)}`}
                  tone="plus"
                  hint={`${fmtInt(pendingPurchaseLatamPoints)} pts • ${fmtInt(caixaImediatoCalc.pendingLatamMil)} milheiros • ${fmtInt(
                    pendingPurchaseLatamCount
                  )} compras`}
                />
                <Line
                  label="Pontos pendentes (compras OPEN) — Smiles"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.pendingSmilesValueCents)}`}
                  tone="plus"
                  hint={`${fmtInt(pendingPurchaseSmilesPoints)} pts • ${fmtInt(caixaImediatoCalc.pendingSmilesMil)} milheiros • ${fmtInt(
                    pendingPurchaseSmilesCount
                  )} compras`}
                />
                <Line
                  label="Saldos"
                  value={`+${fmtMoneyBR(creditCardsTotalCents)}`}
                  tone="plus"
                  hint={`${fmtInt(creditCards.length)} saldo(s)`}
                />
                <Line label="A receber (Vendas)" value={`+${fmtMoneyBR(caixaImediatoCalc.receivableSalesCents)}`} tone="plus" />
                <Line
                  label="Dívidas a receber"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.receivableDARcents)}`}
                  tone="plus"
                  hint="OPEN + PARTIAL"
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Saídas</div>
                <div className="text-xs text-slate-600">
                  Total: <b className="text-rose-700">-{fmtMoneyBR(caixaImediatoCalc.outCents)}</b>
                </div>
              </div>
              <div className="mt-3 divide-y">
                <Line label="Dívidas em aberto" value={`-${fmtMoneyBR(debtsOpenCents)}`} tone="minus" hint="saldo OPEN" />
                <Line
                  label="Bloqueado (OPEN)"
                  value={`-${fmtMoneyBR(blockedTotals.valueBlockedCents)}`}
                  tone="minus"
                  hint={`${fmtInt(blockedTotals.openCount)} bloqueios`}
                />
                <Line
                  label="Comissões pendentes (cedentes)"
                  value={`-${fmtMoneyBR(pendingCedenteCommissionsCents)}`}
                  tone="minus"
                />
                <Line
                  label="A pagar (funcionários)"
                  value={`-${fmtMoneyBR(employeePayoutsPendingCents)}`}
                  tone="minus"
                />
                <Line label="Impostos pendentes" value={`-${fmtMoneyBR(taxesPendingCents)}`} tone="minus" />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-black p-4 text-white">
              <div className="text-xs opacity-80">Caixa imediato (referência)</div>
              <div className="text-3xl font-bold">{fmtMoneyBR(caixaImediatoCalc.totalImmediateCents)}</div>
              <div className="text-xs opacity-70 mt-1">entradas − (dívidas + bloqueios + pendências)</div>
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-xs text-slate-600">Caixa total (sem corte)</div>
              <div className="text-xl font-bold">{fmtMoneyBR(calc.totalAfterPendingsCents)}</div>
              <div className="text-xs text-slate-500 mt-1">
                milhas totais + pontos pendentes + saldos + a receber − dívidas − pendências
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Histórico manual do caixa</div>
            <div className="text-xs text-slate-500">
              últimos {Math.min(500, snapshotRows.length)} snapshots salvos manualmente
            </div>
          </div>
        </div>

        {snapshotRows.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum snapshot salvo ainda.</div>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Data e hora</th>
                  <th className="px-3 py-2 text-right">Resumo (snapshot)</th>
                  <th className="px-3 py-2 text-right">Caixa imediato (snapshot)</th>
                </tr>
              </thead>
              <tbody>
                {snapshotRows.map((row) => (
                  <tr key={row.momentKey} className="border-t">
                    <td className="px-3 py-2">{dateTimeBR(row.capturedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {row.resumoTotalLiquidoCents == null ? "—" : fmtMoneyBR(row.resumoTotalLiquidoCents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.caixaImediatoTotalLiquidoCents == null
                        ? "—"
                        : fmtMoneyBR(row.caixaImediatoTotalLiquidoCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs text-slate-500">Gráfico:</span>
          {([30, 60, 90, 180, 360] as SnapshotChartRange[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setSnapshotChartRange(range)}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                snapshotChartRange === range
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {range} dias
            </button>
          ))}
        </div>

        <SnapshotEvolutionChart rows={snapshotRows} range={snapshotChartRange} />
      </div>
    </div>
  );
}
