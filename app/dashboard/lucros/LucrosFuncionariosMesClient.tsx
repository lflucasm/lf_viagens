"use client";

import { useEffect, useMemo, useState } from "react";

type SummaryRow = {
  user: { id: string; name: string; login: string; role: string };
  days: number;
  salesCount: number;

  commission1Cents: number;
  commission2Cents: number;
  commission3RateioCents: number;

  grossCents: number;
  taxCents: number;
  payoutTaxCents: number;
  balcaoTaxCents: number;
  feeCents: number;

  balcaoOpsCount: number;
  balcaoGrossCents: number;
  balcaoCommissionCents: number;

  netNoFeeCents: number; // líquido sem taxa (milhas + comissão balcão 60%)
  netWithFeeCents: number; // gross - tax + fee
};

type SummaryResp = {
  ok: true;
  month: string; // YYYY-MM
  startDate: string;
  endDate: string;
  rows: SummaryRow[];
  totals: {
    days: number;
    salesCount: number;
    c1: number;
    c2: number;
    c3: number;
    gross: number;
    tax: number;
    payoutTax: number;
    balcaoTax: number;
    fee: number;
    balcaoOps: number;
    balcaoGross: number;
    balcaoCommission: number;
    netNoFee: number; // ✅ líquido total sem taxa
    netWithFee: number;
  };
};

type HistoryPoint = {
  month: string;
  netNoFeeCents: number;
};

type HistorySeries = {
  user: { id: string; name: string; login: string; role: string };
  points: HistoryPoint[];
};

type HistoryResp = {
  ok: true;
  months: string[];
  series: HistorySeries[];
};

const CHART_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtMoneyCompactBR(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function firstName(full?: string, fallback?: string) {
  const s = String(full || "").trim();
  if (!s) return fallback || "-";
  return s.split(/\s+/)[0] || fallback || "-";
}

function monthLabelBR(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
}

function monthISORecifeClient() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function prevMonth(m: string) {
  const [y0, mo0] = String(m || "").split("-");
  let y = Number(y0);
  let mo = Number(mo0);
  if (!y || !mo) return monthISORecifeClient();
  mo -= 1;
  if (mo === 0) {
    mo = 12;
    y -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  let json: { ok?: boolean; error?: string } | null = null;
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Erro (${res.status})`);
  return json as T;
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function LucroHistoryChart({
  months,
  series,
}: {
  months: string[];
  series: HistorySeries[];
}) {
  if (!months.length || !series.length) {
    return (
      <div className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-semibold">Histórico mensal por funcionário</div>
        <div className="mt-1 text-xs text-neutral-500">Líquido sem taxa por mês, usando a mesma base da tabela.</div>
        <div className="mt-4 text-sm text-neutral-500">Ainda não há histórico suficiente para montar o gráfico.</div>
      </div>
    );
  }

  const width = 980;
  const height = 270;
  const leftPad = 48;
  const rightPad = 18;
  const topPad = 18;
  const bottomPad = 34;
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;

  const allValues = series.flatMap((row) => row.points.map((p) => p.netNoFeeCents));
  const minY = Math.min(0, ...allValues);
  const maxY = Math.max(1, ...allValues);
  const dx = months.length <= 1 ? 0 : plotW / (months.length - 1);
  const scaleY = (value: number) => {
    const t = (value - minY) / (maxY - minY || 1);
    return topPad + plotH - t * plotH;
  };

  const tickValues = Array.from({ length: 4 }, (_, idx) => maxY - ((maxY - minY) * idx) / 3);
  const xLabelStep = months.length > 18 ? 3 : months.length > 12 ? 2 : 1;

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm font-semibold">Histórico mensal por funcionário</div>
      <div className="mt-1 text-xs text-neutral-500">Líquido sem taxa por mês, usando a mesma base da tabela.</div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        {series.map((row, idx) => (
          <span key={row.user.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
            {firstName(row.user.name, row.user.login)}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full">
        {tickValues.map((tick, idx) => (
          <line
            key={`grid-${idx}`}
            x1={leftPad}
            x2={leftPad + plotW}
            y1={scaleY(tick)}
            y2={scaleY(tick)}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {tickValues.map((tick, idx) => (
          <text
            key={`label-y-${idx}`}
            x={4}
            y={scaleY(tick) + 4}
            fontSize="10"
            fill="#64748b"
          >
            {fmtMoneyCompactBR(Math.round(tick))}
          </text>
        ))}

        {series.map((row, idx) => {
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          const points = row.points
            .map((point, pointIdx) => `${leftPad + pointIdx * dx},${scaleY(point.netNoFeeCents)}`)
            .join(" ");

          return (
            <g key={row.user.id}>
              <polyline fill="none" stroke={color} strokeWidth="2.5" points={points} />
              {row.points.map((point, pointIdx) => (
                <circle
                  key={`${row.user.id}-${point.month}`}
                  cx={leftPad + pointIdx * dx}
                  cy={scaleY(point.netNoFeeCents)}
                  r="3"
                  fill={color}
                >
                  <title>{`${firstName(row.user.name, row.user.login)} • ${monthLabelBR(point.month)} • ${fmtMoneyBR(point.netNoFeeCents)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {months.map((month, idx) => {
          if (idx % xLabelStep !== 0 && idx !== months.length - 1) return null;
          return (
            <text
              key={`label-x-${month}`}
              x={leftPad + idx * dx}
              y={topPad + plotH + 18}
              textAnchor={idx === months.length - 1 ? "end" : idx === 0 ? "start" : "middle"}
              fontSize="10"
              fill="#64748b"
            >
              {monthLabelBR(month)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** ✅ dias no mês do tipo "YYYY-MM" (UTC safe) */
function daysInMonth(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // mês seguinte, dia 0 => último dia do mês atual
}

/** ✅ dia do mês "hoje" no timezone Recife */
function recifeDayOfMonthToday() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const day = Number(parts.day);
  return Number.isFinite(day) && day > 0 ? day : 1;
}

export default function LucrosFuncionariosMesClient() {
  const [month, setMonth] = useState<string>(() => monthISORecifeClient());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<SummaryResp | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState("");
  const [history, setHistory] = useState<HistoryResp | null>(null);

  async function load(m = month) {
    setLoading(true);
    setErr("");
    try {
      const out = await apiGet<SummaryResp>(`/api/payouts/funcionarios/month-summary?month=${encodeURIComponent(m)}`);
      setData(out);
    } catch (e: unknown) {
      setData(null);
      setErr(e instanceof Error && e.message ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryErr("");
    try {
      const out = await apiGet<HistoryResp>("/api/payouts/funcionarios/history");
      setHistory(out);
    } catch (e: unknown) {
      setHistory(null);
      setHistoryErr(e instanceof Error && e.message ? e.message : "Erro ao carregar histórico.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    load(month);
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // ✅ tabela principal: ordena pelo líquido sem taxa
  const rows = useMemo(() => {
    return (data?.rows || []).slice().sort((a, b) => b.netNoFeeCents - a.netNoFeeCents);
  }, [data]);

  // ✅ fator de projeção do mês (dia atual / dias do mês)
  const projectionMeta = useMemo(() => {
    const daysMonth = daysInMonth(month);
    const isCurrentMonth = month === monthISORecifeClient();
    const daysPassed = isCurrentMonth ? recifeDayOfMonthToday() : daysMonth; // mês passado => projeção = real
    const safePassed = Math.max(1, Math.min(daysMonth, daysPassed));
    const factor = daysMonth / safePassed;
    return { daysMonth, daysPassed: safePassed, factor, isCurrentMonth };
  }, [month]);

  // ✅ projeção por funcionário + total
  const projectionRows = useMemo(() => {
    const base = data?.rows || [];
    const factor = projectionMeta.factor;

    const list = base.map((r) => {
      const current = Number(r.netNoFeeCents || 0);
      const projected = Math.round(current * factor);
      return {
        id: r.user.id,
        name: firstName(r.user.name, r.user.login),
        login: r.user.login,
        currentCents: current,
        projectedCents: projected,
        deltaCents: projected - current,
      };
    });

    // ordena pela projeção (opcional, fica mais “ranking”)
    list.sort((a, b) => b.projectedCents - a.projectedCents);

    const totalCurrent = Number(data?.totals.netNoFee || 0);
    const totalProjected = Math.round(totalCurrent * factor);

    return {
      list,
      total: {
        currentCents: totalCurrent,
        projectedCents: totalProjected,
        deltaCents: totalProjected - totalCurrent,
      },
    };
  }, [data, projectionMeta.factor]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Funcionários — análise do mês</h2>
          <p className="text-sm text-neutral-500">
            Baseado nos dias <b>computados</b> em Comissões → Funcionários + <b>comissão de Emissões no balcão (60%)</b>.
            <b> Líquido aqui é SEM taxa de embarque</b>.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500">Mês</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-xl border px-3 text-sm"
            />
          </div>

          <button onClick={() => setMonth(prevMonth(month))} className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50">
            Mês anterior
          </button>

          <button
            onClick={() => load(month)}
            disabled={loading}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        <KPI label="Líquido total (sem taxa)" value={fmtMoneyBR(data?.totals.netNoFee || 0)} />
        <KPI label="Comissão balcão (60%)" value={fmtMoneyBR(data?.totals.balcaoCommission || 0)} />
        <KPI label="Imposto total (milhas + balcão)" value={fmtMoneyBR(data?.totals.tax || 0)} />
        <KPI label="Taxas (reembolso)" value={fmtMoneyBR(data?.totals.fee || 0)} />
        <KPI label="Bruto (C1+C2+C3)" value={fmtMoneyBR(data?.totals.gross || 0)} />
        <KPI label="Vendas (mês)" value={String(data?.totals.salesCount || 0)} />
        <KPI label="Dias computados" value={String(data?.totals.days || 0)} />
      </div>

      {err ? <div className="rounded-2xl border bg-rose-50 p-3 text-sm text-rose-800">{err}</div> : null}

      {historyErr ? <div className="rounded-2xl border bg-rose-50 p-3 text-sm text-rose-800">{historyErr}</div> : null}

      {historyLoading && !history ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-neutral-500">Carregando histórico mensal...</div>
      ) : (
        <LucroHistoryChart months={history?.months || []} series={history?.series || []} />
      )}

      {/* ======= TABELA PRINCIPAL ======= */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3 text-right">Dias</th>
                <th className="px-4 py-3 text-right">Vendas</th>
                <th className="px-4 py-3">C1 (1%)</th>
                <th className="px-4 py-3">C2 (bônus)</th>
                <th className="px-4 py-3">C3 (rateio)</th>
                <th className="px-4 py-3">Imposto</th>
                <th className="px-4 py-3">Taxa embarque</th>
                <th className="px-4 py-3">Balcão (60%)</th>
                <th className="px-4 py-3">Líquido total (sem taxa)</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const display = firstName(r.user.name, r.user.login);
                return (
                  <tr key={r.user.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{display}</div>
                      <div className="text-xs text-neutral-500">{r.user.login}</div>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">{r.days}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.salesCount}</td>

                    <td className="px-4 py-3">{fmtMoneyBR(r.commission1Cents)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.commission2Cents)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.commission3RateioCents)}</td>

                    <td className="px-4 py-3">{fmtMoneyBR(r.taxCents)}</td>
                    <td className="px-4 py-3">{fmtMoneyBR(r.feeCents)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{fmtMoneyBR(r.balcaoCommissionCents)}</div>
                      <div className="text-xs text-neutral-500">{r.balcaoOpsCount} ops</div>
                    </td>

                    <td className="px-4 py-3 font-semibold">{fmtMoneyBR(r.netNoFeeCents)}</td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-neutral-500" colSpan={10}>
                    Nenhum dado para este mês (ou dias ainda não foram computados).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======= NOVA TABELA: PROJEÇÃO ======= */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">Projeção do mês (líquido sem taxa)</div>
          <div className="text-xs text-neutral-500">
            Projeção = (líquido até hoje ÷ dia do mês) × dias do mês — base: dia{" "}
            <b>{projectionMeta.daysPassed}</b> de <b>{projectionMeta.daysMonth}</b>
            {projectionMeta.isCurrentMonth ? "" : " (mês fechado: projeção = real)"}.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3 text-right">Líquido atual</th>
                <th className="px-4 py-3 text-right">Projeção mês</th>
                <th className="px-4 py-3 text-right">Diferença</th>
              </tr>
            </thead>

            <tbody>
              {projectionRows.list.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-neutral-500">{r.login}</div>
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoneyBR(r.currentCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoneyBR(r.projectedCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoneyBR(r.deltaCents)}</td>
                </tr>
              ))}

              {/* TOTAL */}
              <tr className="border-t bg-neutral-50/50">
                <td className="px-4 py-3 font-semibold">TOTAL</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoneyBR(projectionRows.total.currentCents)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoneyBR(projectionRows.total.projectedCents)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoneyBR(projectionRows.total.deltaCents)}</td>
              </tr>

              {!projectionRows.list.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-neutral-500" colSpan={4}>
                    Sem dados para projetar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border bg-neutral-50 p-3 text-xs text-neutral-600">
        Dica: se o mês estiver “baixo”, geralmente faltam dias computados. Vá em <b>Comissões → Funcionários</b> e rode
        “Computar dia” nos dias fechados.
      </div>
    </div>
  );
}
