"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function fmtMoneyBRFromCents(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function monthISORecifeClient() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: any, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

function daysInMonth(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function weekdayOfFirst(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return 0;
  return new Date(y, m - 1, 1).getDay(); // 0 dom .. 6 sab
}

function isoDateFromMonthDay(yyyyMm: string, day: number) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || !day) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any)?.ok === false) {
    throw new Error((json as any)?.error || `Erro (${res.status})`);
  }
  return json as T;
}

type StatusFilter = "ALL" | "PAID" | "PENDING";
type Mode = "model" | "raw";

/** =========================
 *  MODELO (AGRUPADO)
 *  ========================= */
type PreviewRowModel = {
  cpfCnpj: string;
  nome: string;
  info: string;
  totalServiceCents: number;
  deductionCents: number;
  profitCents: number;
  salesCount: number;
};

/** =========================
 *  DETALHADO (UMA LINHA POR VENDA)
 *  ========================= */
type PreviewRowRaw = {
  saleId: string;
  date: string; // YYYY-MM-DD
  numero: string;
  paymentStatus: string; // PAID | PENDING | etc
  cpfCnpj: string;
  nome: string;
  totalServiceCents: number;
  deductionCents: number;
  profitCents: number;
};

type PreviewResp = {
  ok: true;
  mode: Mode;
  scope: { month: string; date: string | null; status: string };
  startDate: string;
  endDate: string;
  totals: {
    salesCount: number;
    totalSoldCents: number;

    // ✅ lucro do período (vendas sem 8% + balcão líquido)
    profitTotalCents: number;
    salesProfitTotalCents?: number;
    balcaoNetProfitCents?: number;

    // ✅ prejuízo do mês (negativo ou 0) e lucro tributável (>= 0)
    lossTotalCents: number;
    profitAfterLossCents: number;

    totalDeductionCents: number;
  };
  rows: Array<PreviewRowModel | PreviewRowRaw>;
};

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default function VendasDadosContabeisClient() {
  const [month, setMonth] = useState<string>(() => monthISORecifeClient());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [mode, setMode] = useState<Mode>("model");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PreviewResp | null>(null);

  const selectedDateISO = useMemo(() => {
    if (!selectedDay) return "";
    return isoDateFromMonthDay(month, selectedDay);
  }, [month, selectedDay]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      qs.set("month", month);
      qs.set("status", status);
      qs.set("mode", mode);
      if (selectedDateISO) qs.set("date", selectedDateISO);

      const out = await apiGet<PreviewResp>(`/api/dados-contabeis/vendas/preview?${qs.toString()}`);
      setData(out);
    } catch (e: any) {
      setData(null);
      setErr(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, selectedDateISO, status, mode]);

  const cal = useMemo(() => {
    const dim = daysInMonth(month);
    const offset = weekdayOfFirst(month); // 0 dom
    const cells: Array<{ day?: number }> = [];
    for (let i = 0; i < offset; i++) cells.push({});
    for (let d = 1; d <= dim; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0) cells.push({});
    return { cells };
  }, [month]);

  function exportXlsx() {
    const qs = new URLSearchParams();
    qs.set("month", month);
    qs.set("status", status);
    qs.set("mode", mode);
    if (selectedDateISO) qs.set("date", selectedDateISO);

    window.location.href = `/api/dados-contabeis/vendas/export?${qs.toString()}`;
  }

  const rows = data?.rows || [];

  const totals = data?.totals || {
    salesCount: 0,
    totalSoldCents: 0,
    profitTotalCents: 0,
    lossTotalCents: 0,
    profitAfterLossCents: 0,
    totalDeductionCents: 0,
  };

  const isModel = mode === "model";
  const isDayScope = !!selectedDateISO;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Dados contábeis — Vendas</h1>
          <p className="text-sm text-neutral-500">
            Lucro do período = <b>vendas (grossProfitCents, sem 8%) + balcão (líquido)</b>. <br />
            Lucro tributável = <b>lucro − prejuízos do mês</b> (compras finalizadas com lucro negativo).{" "}
            {isModel ? (
              <>O rateio é proporcional ao total vendido por cliente.</>
            ) : (
              <>O rateio é proporcional ao valor de cada venda.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500">Mês</label>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setSelectedDay(null);
              }}
              className="h-10 rounded-xl border px-3 text-sm"
            />
          </div>

          {/* modo */}
          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-500">Visualização</div>
            <button
              className={cn(
                "rounded-full border px-3 py-2 text-xs",
                mode === "model" ? "bg-black text-white" : "hover:bg-neutral-50"
              )}
              onClick={() => setMode("model")}
              title="Agrupa por cliente (modelo contábil)"
              type="button"
            >
              Modelo
            </button>
            <button
              className={cn(
                "rounded-full border px-3 py-2 text-xs",
                mode === "raw" ? "bg-black text-white" : "hover:bg-neutral-50"
              )}
              onClick={() => setMode("raw")}
              title="Mostra uma linha por venda (sem agrupar)"
              type="button"
            >
              Detalhado
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-500">Status</div>
            <button
              className={cn(
                "rounded-full border px-3 py-2 text-xs",
                status === "ALL" ? "bg-black text-white" : "hover:bg-neutral-50"
              )}
              onClick={() => setStatus("ALL")}
              type="button"
            >
              Todos
            </button>
            <button
              className={cn(
                "rounded-full border px-3 py-2 text-xs",
                status === "PAID" ? "bg-black text-white" : "hover:bg-neutral-50"
              )}
              onClick={() => setStatus("PAID")}
              type="button"
            >
              Pagos
            </button>
            <button
              className={cn(
                "rounded-full border px-3 py-2 text-xs",
                status === "PENDING" ? "bg-black text-white" : "hover:bg-neutral-50"
              )}
              onClick={() => setStatus("PENDING")}
              type="button"
            >
              Pendentes
            </button>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="h-10 rounded-xl border px-4 text-sm hover:bg-neutral-50 disabled:opacity-50"
            type="button"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>

          <button
            onClick={exportXlsx}
            disabled={!rows.length}
            className="h-10 rounded-xl bg-black px-4 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            title={isModel ? "Gerar XLSX no modelo" : "Gerar XLSX detalhado (todas as vendas)"}
            type="button"
          >
            Exportar XLSX
          </button>
        </div>
      </div>

      {/* calendário */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Calendário</div>
          {selectedDay ? (
            <button
              className="rounded-xl border px-3 py-1.5 text-xs hover:bg-neutral-50"
              onClick={() => setSelectedDay(null)}
              type="button"
            >
              Limpar dia (voltar pro mês)
            </button>
          ) : (
            <div className="text-xs text-neutral-500">Clique em um dia para filtrar</div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-7 gap-2 text-center text-xs">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((w) => (
            <div key={w} className="text-neutral-500">
              {w}
            </div>
          ))}

          {cal.cells.map((c, idx) => {
            const day = c.day;
            if (!day) return <div key={idx} className="h-10" />;
            const active = selectedDay === day;
            return (
              <button
                key={idx}
                onClick={() => setSelectedDay((prev) => (prev === day ? null : day))}
                className={cn(
                  "h-10 rounded-xl border text-sm",
                  active ? "bg-black text-white border-black" : "hover:bg-neutral-50"
                )}
                type="button"
              >
                {day}
              </button>
            );
          })}
        </div>

        {selectedDateISO ? (
          <div className="mt-3 text-xs text-neutral-500">
            Filtrando por dia: <b>{selectedDateISO}</b>
          </div>
        ) : (
          <div className="mt-3 text-xs text-neutral-500">
            Filtrando por mês inteiro: <b>{month}</b>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <KPI label="Nº de vendas" value={String(totals.salesCount || 0)} />
        <KPI label="Total vendido" value={fmtMoneyBRFromCents(totals.totalSoldCents || 0)} />
        <KPI label="Lucro vendas (sem 8%)" value={fmtMoneyBRFromCents(totals.salesProfitTotalCents || 0)} />
        <KPI label="Lucro líquido balcão" value={fmtMoneyBRFromCents(totals.balcaoNetProfitCents || 0)} />
        <KPI label="Lucro total período" value={fmtMoneyBRFromCents(totals.profitTotalCents || 0)} />

        {/* Observação: mesmo filtrando por DIA, o prejuízo é do MÊS (pra base fiscal) */}
        <KPI label="Prejuízo do mês" value={fmtMoneyBRFromCents(totals.lossTotalCents || 0)} />
        <KPI label="Lucro tributável" value={fmtMoneyBRFromCents(totals.profitAfterLossCents || 0)} />
      </div>

      {isDayScope ? (
        <div className="rounded-2xl border bg-amber-50 p-3 text-xs text-amber-900">
          Observação: você está filtrando por <b>dia</b>, mas <b>Prejuízo do mês</b> e <b>Lucro tributável</b>{" "}
          continuam sendo calculados no <b>mês inteiro</b> (base fiscal do mês).
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border bg-rose-50 p-3 text-sm text-rose-800">{err}</div>
      ) : null}

      {/* tabela */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">
            {isModel ? "Prévia do XLSX (modelo)" : "Prévia do XLSX (detalhado)"}
          </div>
          <div className="text-xs text-neutral-500">
            Período: <b>{data?.startDate || "—"}</b> até <b>{data?.endDate || "—"}</b>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              {isModel ? (
                <tr>
                  <th className="px-4 py-3">CPF/CNPJ</th>
                  <th className="px-4 py-3">NOME</th>
                  <th className="px-4 py-3">INFORMAÇÕES</th>
                  <th className="px-4 py-3 text-right">VALOR TOTAL DO SERVIÇO</th>
                  <th className="px-4 py-3 text-right">DEDUÇÕES DA BASE DE CÁLCULO</th>
                  <th className="px-4 py-3 text-right">LUCRO</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-4 py-3">DATA</th>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">STATUS</th>
                  <th className="px-4 py-3">CPF/CNPJ</th>
                  <th className="px-4 py-3">CLIENTE</th>
                  <th className="px-4 py-3 text-right">TOTAL</th>
                  <th className="px-4 py-3 text-right">DEDUÇÃO</th>
                  <th className="px-4 py-3 text-right">LUCRO</th>
                </tr>
              )}
            </thead>

            <tbody>
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={isModel ? 6 : 8} className="px-4 py-8 text-sm text-neutral-500">
                    Nenhum dado para este período.
                  </td>
                </tr>
              ) : null}

              {isModel
                ? (rows as PreviewRowModel[]).map((r, i) => (
                    <tr key={`${r.cpfCnpj}-${i}`} className="border-t">
                      <td className="px-4 py-3">{r.cpfCnpj}</td>
                      <td className="px-4 py-3 font-medium">{r.nome}</td>
                      <td className="px-4 py-3 text-xs text-neutral-600">{r.info}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {fmtMoneyBRFromCents(r.totalServiceCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoneyBRFromCents(r.deductionCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {fmtMoneyBRFromCents(r.profitCents)}
                      </td>
                    </tr>
                  ))
                : (rows as PreviewRowRaw[]).map((r) => (
                    <tr key={r.saleId} className="border-t">
                      <td className="px-4 py-3">{r.date}</td>
                      <td className="px-4 py-3 font-medium">{r.numero}</td>
                      <td className="px-4 py-3 text-xs text-neutral-600">{r.paymentStatus}</td>
                      <td className="px-4 py-3">{r.cpfCnpj}</td>
                      <td className="px-4 py-3">{r.nome}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {fmtMoneyBRFromCents(r.totalServiceCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoneyBRFromCents(r.deductionCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {fmtMoneyBRFromCents(r.profitCents)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-neutral-500">
          {isModel ? (
            <>
              Regras: <b>Lucro proporcional</b> = (Total do cliente / Total vendido no período) ×{" "}
              <b>Lucro tributável do período</b>. <br />
              Dedução = Total do serviço − Lucro.
            </>
          ) : (
            <>
              Regras: <b>Lucro proporcional por venda</b> = (Total da venda / Total vendido no período) ×{" "}
              <b>Lucro tributável do período</b>. <br />
              Dedução = Total da venda − Lucro.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
