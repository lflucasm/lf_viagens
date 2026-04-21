"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ClientesOverviewResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    monthRef: string;
    payoutDates: string[];
    setting: {
      ownerPercent: number;
      othersPercent: number;
      taxPercent: number;
      payoutDays: number[];
    };
    totals: {
      totalPaidCents: number;
      totalTaxCents: number;
      totalNetCents: number;
      totalOwnerShareCents: number;
      totalOthersShareCents: number;
    };
    rows: Array<{
      employee: { id: string; name: string; login: string };
      clientsTotal: number;
      clientsApproved: number;
      ownPaidCents: number;
      earningCents: number;
    }>;
  };
};

function formatMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export default function GrupoVipClientesClient() {
  const [month, setMonth] = useState(monthNow());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ClientesOverviewResponse["data"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      const res = await fetch(`/api/grupo-vip/clientes?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as ClientesOverviewResponse;
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error || "Erro ao carregar dados de clientes VIP.");
      }
      setData(json.data);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const payoutLabel = useMemo(() => {
    if (!data || data.payoutDates.length === 0) return "—";
    return data.payoutDates.map((value) => formatDate(value)).join(" • ");
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-3xl font-black text-slate-900">Grupo VIP • Clientes</h1>
        <p className="mt-1 text-sm text-slate-600">
          Base separada do módulo de milhas: clientes VIP, valores pagos e distribuição
          de lucro por funcionário.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Mês de referência
            </span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </section>
      )}

      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <div className="text-xs uppercase text-cyan-700">Total pago (mês)</div>
              <div className="mt-1 text-2xl font-bold text-cyan-950">
                {formatMoney(data.totals.totalPaidCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs uppercase text-rose-700">
                Imposto retido ({formatPercent(data.setting.taxPercent)})
              </div>
              <div className="mt-1 text-2xl font-bold text-rose-950">
                {formatMoney(data.totals.totalTaxCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs uppercase text-emerald-700">Lucro distribuível</div>
              <div className="mt-1 text-2xl font-bold text-emerald-950">
                {formatMoney(data.totals.totalNetCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="text-xs uppercase text-violet-700">Pagamento previsto</div>
              <div className="mt-1 text-sm font-semibold text-violet-900">
                {payoutLabel}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm text-slate-600">
              Regra atual: responsável {formatPercent(data.setting.ownerPercent)} •
              demais funcionários {formatPercent(data.setting.othersPercent)}.
            </div>
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Funcionário</th>
                    <th className="px-3 py-2 text-left">Clientes</th>
                    <th className="px-3 py-2 text-left">Valor pago (clientes dele)</th>
                    <th className="px-3 py-2 text-left">Ganho no mês</th>
                    <th className="px-3 py-2 text-left">Participação no lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const sharePct =
                      data.totals.totalNetCents > 0
                        ? (row.earningCents / data.totals.totalNetCents) * 100
                        : 0;
                    return (
                      <tr key={row.employee.id} className="border-t border-slate-200">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">
                            {row.employee.name}
                          </div>
                          <div className="text-xs text-slate-500">@{row.employee.login}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">
                            {row.clientsApproved}
                          </div>
                          <div className="text-xs text-slate-500">
                            total: {row.clientsTotal}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {formatMoney(row.ownPaidCents)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-emerald-700">
                          {formatMoney(row.earningCents)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatPercent(sharePct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
