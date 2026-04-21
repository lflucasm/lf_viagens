"use client";

import { useEffect, useMemo, useState } from "react";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Row = {
  id: string;
  numero: string;
  status: "OPEN" | "CLOSED" | "CANCELED";

  ciaAerea: Program | null;
  pontosCiaTotal: number;

  finalSalesCents: number | null;
  finalSalesPointsValueCents: number | null;
  finalSalesTaxesCents: number | null;

  finalProfitBrutoCents: number | null;
  finalBonusCents: number | null;
  finalProfitCents: number | null;

  finalSoldPoints: number | null;
  finalPax: number | null;
  finalAvgMilheiroCents: number | null;
  finalRemainingPoints: number | null;

  finalizedAt: string | null;
  finalizedBy: { id: string; name: string; login: string } | null;

  cedente: { id: string; identificador: string; nomeCompleto: string } | null;

  _count: { sales: number };
  sales: Array<{ date: string; totalCents: number; points: number; passengers: number }>;

  createdAt: string;
  updatedAt: string;
};

type MonthSum = { month: string; count: number; sumProfitCents: number };

type ApiResp = {
  ok: true;
  purchases: Row[];
  months: MonthSum[];
  totals: {
    allCount: number;
    allProfitCents: number;
    listCount: number;
    listProfitCents: number;
  };
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}
function pick(n: number | null | undefined, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * ✅ FIX: evita “voltar” pro mês anterior no fuso BR.
 * - cria data no dia 15 (não pega borda)
 * - formata com timeZone UTC (não converte)
 */
function monthLabel(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);

  const d = new Date(Date.UTC(y, m - 1, 15));

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !(json as any)?.ok) throw new Error((json as any)?.error || `Erro ${res.status}`);
  return json as T;
}

function MonthBarChart({ data }: { data: MonthSum[] }) {
  const sorted = useMemo(() => {
    return [...(data || [])].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  }, [data]);

  const vals = sorted.map((m) => Math.abs(pick(m.sumProfitCents)));
  const max = Math.max(1, ...vals);

  return (
    <div className="w-full">
      <div className="flex h-[180px] items-end gap-2">
        {sorted.map((m) => {
          const v = Math.abs(pick(m.sumProfitCents));
          const h = Math.round((v / max) * 160);
          return (
            <div key={m.month} className="min-w-[20px] flex-1">
              <div
                className="w-full rounded-lg bg-slate-200"
                style={{ height: `${h}px` }}
                title={`${m.month} • ${fmtMoneyBR(m.sumProfitCents)}`}
              />
              <div className="mt-1 text-center text-[10px] text-slate-600">{m.month.slice(5, 7)}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[11px] text-slate-500">
        Meses (eixo X) • Altura = <b>prejuízo absoluto</b>
      </div>
    </div>
  );
}

export default function PrejuizoPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [month, setMonth] = useState<string>("ALL");

  const [rows, setRows] = useState<Row[]>([]);
  const [months, setMonths] = useState<MonthSum[]>([]);
  const [totals, setTotals] = useState<ApiResp["totals"]>({
    allCount: 0,
    allProfitCents: 0,
    listCount: 0,
    listProfitCents: 0,
  });

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (month !== "ALL") qs.set("month", month);
      qs.set("take", "2000");

      const json = await fetchJson<ApiResp>(`/api/vendas/prejuizo?${qs.toString()}`);

      const list = (json.purchases || []).filter((p) => !!p.finalizedAt && pick(p.finalProfitCents) < 0);

      setRows(list);
      setMonths(Array.isArray(json.months) ? json.months : []);
      setTotals(json.totals);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar.");
      setRows([]);
      setMonths([]);
      setTotals({ allCount: 0, allProfitCents: 0, listCount: 0, listProfitCents: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, month]);

  const monthOptions = useMemo(() => {
    const opts = [...months].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0)); // desc
    return opts.map((m) => m.month);
  }, [months]);

  const listTotals = useMemo(() => {
    let sumProfit = 0;
    let sumTaxes = 0;

    for (const r of rows) {
      sumProfit += pick(r.finalProfitCents);
      sumTaxes += pick(r.finalSalesTaxesCents);
    }

    const avg = rows.length ? Math.round(sumProfit / rows.length) : 0;
    return { sumProfit, sumTaxes, avg };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-bold">Prejuízo (compras finalizadas)</h1>
            <div className="text-sm text-slate-600">
              Somente <b>CLOSED</b> com <b>finalizedAt</b> e <b>lucro líquido &lt; 0</b>.
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm md:w-[360px]"
              placeholder="Buscar por número, cedente, identificador..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <select
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm md:w-[220px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="ALL">Todos os meses</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} ({m})
                </option>
              ))}
            </select>

            <button className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50" onClick={load} disabled={loading}>
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Kpi label="Contas (filtro atual)" value={fmtInt(rows.length)} />
          <Kpi label="Prejuízo total (filtro atual)" value={fmtMoneyBR(listTotals.sumProfit)} />
          <Kpi label="Média por conta" value={fmtMoneyBR(listTotals.avg)} />
        </div>

        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold">Prejuízo por mês</div>
            <div className="text-xs text-slate-500">
              Total geral (todos os meses): <b>{fmtMoneyBR(totals.allProfitCents)}</b> • {fmtInt(totals.allCount)} contas
            </div>
          </div>
          <div className="text-xs text-slate-500">Clique em um mês na tabela para filtrar</div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <MonthBarChart data={months} />
          </div>

          <div className="overflow-hidden rounded-2xl border">
            <div className="overflow-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="p-3">Mês</th>
                    <th className="p-3">Contas</th>
                    <th className="p-3">Prejuízo</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>

                <tbody>
                  {months.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-600" colSpan={4}>
                        {loading ? "Carregando..." : "Nenhum prejuízo encontrado."}
                      </td>
                    </tr>
                  ) : (
                    [...months]
                      .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0))
                      .map((m) => (
                        <tr key={m.month} className="border-t hover:bg-white">
                          <td className="p-3">
                            <div className="font-medium">{monthLabel(m.month)}</div>
                            <div className="text-[11px] text-slate-500">{m.month}</div>
                          </td>
                          <td className="p-3">{fmtInt(m.count)}</td>
                          <td className="p-3 font-semibold text-red-700">{fmtMoneyBR(m.sumProfitCents)}</td>
                          <td className="p-3 text-right">
                            <button
                              className="rounded-xl border px-3 py-1.5 text-xs hover:bg-slate-50"
                              onClick={() => setMonth(m.month)}
                              type="button"
                            >
                              Filtrar
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Lista (prejuízos)</div>
          <div className="text-xs text-slate-500">
            {month === "ALL" ? "Todos os meses" : `Mês: ${monthLabel(month)} (${month})`} • até 2000 registros
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">Compra</th>
                <th className="py-2 pr-3">Cedente</th>
                <th className="py-2 pr-3">CIA</th>
                <th className="py-2 pr-3">Pontos vendidos</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Taxas</th>
                <th className="py-2 pr-3">Lucro líquido</th>
                <th className="py-2 pr-3">Finalizado em</th>
                <th className="py-2 pr-3">Por</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={9}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={9}>
                    Nenhuma compra com prejuízo no filtro atual.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-slate-50">
                    <td className="py-2 pr-3">
                      <div className="font-semibold">{r.numero}</div>
                      <div className="text-[11px] text-slate-500">{r.status}</div>
                    </td>

                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.cedente?.nomeCompleto || "-"}</div>
                      <div className="text-[11px] text-slate-500">{r.cedente?.identificador || ""}</div>
                    </td>

                    <td className="py-2 pr-3">{r.ciaAerea || "-"}</td>

                    <td className="py-2 pr-3">
                      <div className="font-medium">{fmtInt(pick(r.finalSoldPoints))}</div>
                      {r.finalRemainingPoints != null ? (
                        <div className="text-[11px] text-slate-500">Restante: {fmtInt(pick(r.finalRemainingPoints))}</div>
                      ) : (
                        <div className="text-[11px] text-slate-500">&nbsp;</div>
                      )}
                    </td>

                    <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalSalesCents))}</td>
                    <td className="py-2 pr-3">{fmtMoneyBR(pick(r.finalSalesTaxesCents))}</td>

                    <td className="py-2 pr-3 font-semibold text-red-700">{fmtMoneyBR(pick(r.finalProfitCents))}</td>
                    <td className="py-2 pr-3">{fmtDateTimeBR(r.finalizedAt)}</td>

                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.finalizedBy?.name || "-"}</div>
                      <div className="text-[11px] text-slate-500">{r.finalizedBy?.login || ""}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Dica: use o filtro de mês ou a busca por cedente/identificador para achar rápido.
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
