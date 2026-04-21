"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RateioResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    monthRef: string;
    setting: {
      ownerPercent: number;
      othersPercent: number;
      taxPercent: number;
      payoutDays: number[];
      updatedAt: string;
    };
    employeeShares: Array<{
      employee: { id: string; name: string; login: string };
      percent: number;
    }>;
    employeeSharesSumPercent: number;
    payoutDates: string[];
  };
};

type ClientesResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    monthRef: string;
    totals: {
      totalPaidCents: number;
      totalTaxCents: number;
      totalNetCents: number;
    };
    rows: Array<{
      employee: { id: string; name: string; login: string };
      earningCents: number;
      ownPaidCents: number;
      othersSharePercent: number;
    }>;
  };
};

type FormState = {
  ownerPercent: string;
  othersPercent: string;
  taxPercent: string;
  payoutDays: string;
};

type EmployeeShareFormRow = {
  employeeId: string;
  name: string;
  login: string;
  percent: string;
};

function formatMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseDecimal(input: string) {
  const value = Number(String(input || "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

export default function GrupoVipRateioClient() {
  const [month, setMonth] = useState(monthNow());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settingData, setSettingData] = useState<RateioResponse["data"] | null>(
    null
  );
  const [clientesData, setClientesData] = useState<ClientesResponse["data"] | null>(
    null
  );

  const [form, setForm] = useState<FormState>({
    ownerPercent: "70",
    othersPercent: "30",
    taxPercent: "10",
    payoutDays: "1",
  });
  const [employeeShares, setEmployeeShares] = useState<EmployeeShareFormRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rateioRes, clientesRes] = await Promise.all([
        fetch(`/api/grupo-vip/rateio?month=${encodeURIComponent(month)}`, {
          cache: "no-store",
        }),
        fetch(`/api/grupo-vip/clientes?month=${encodeURIComponent(month)}`, {
          cache: "no-store",
        }),
      ]);

      const [rateioJson, clientesJson] = (await Promise.all([
        rateioRes.json().catch(() => ({})),
        clientesRes.json().catch(() => ({})),
      ])) as [RateioResponse, ClientesResponse];

      if (!rateioRes.ok || !rateioJson.ok || !rateioJson.data) {
        throw new Error(rateioJson.error || "Erro ao carregar configuração.");
      }
      if (!clientesRes.ok || !clientesJson.ok || !clientesJson.data) {
        throw new Error(clientesJson.error || "Erro ao carregar prévia.");
      }

      setSettingData(rateioJson.data);
      setClientesData(clientesJson.data);
      setForm({
        ownerPercent: String(rateioJson.data.setting.ownerPercent).replace(".", ","),
        othersPercent: String(rateioJson.data.setting.othersPercent).replace(".", ","),
        taxPercent: String(rateioJson.data.setting.taxPercent).replace(".", ","),
        payoutDays: rateioJson.data.setting.payoutDays.join(","),
      });
      setEmployeeShares(
        rateioJson.data.employeeShares.map((item) => ({
          employeeId: item.employee.id,
          name: item.employee.name,
          login: item.employee.login,
          percent: String(item.percent).replace(".", ","),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setSettingData(null);
      setClientesData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const sumPercent = useMemo(
    () => parseDecimal(form.ownerPercent) + parseDecimal(form.othersPercent),
    [form.ownerPercent, form.othersPercent]
  );
  const employeeSharesSum = useMemo(
    () => employeeShares.reduce((acc, row) => acc + parseDecimal(row.percent), 0),
    [employeeShares]
  );

  async function save() {
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/grupo-vip/rateio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPercent: form.ownerPercent,
          othersPercent: form.othersPercent,
          taxPercent: form.taxPercent,
          payoutDays: form.payoutDays,
          employeeShares: employeeShares.map((row) => ({
            employeeId: row.employeeId,
            percent: row.percent,
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as RateioResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar configuração.");
      }
      setSuccess("Rateio atualizado com sucesso.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-3xl font-black text-slate-900">Grupo VIP • Rateio</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configuração separada do rateio do Grupo VIP (não mistura com compras e
          vendas de milhas).
        </p>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </section>
      )}
      {success && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Responsável (%)
            </span>
            <input
              value={form.ownerPercent}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ownerPercent: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Demais funcionários (%)
            </span>
            <input
              value={form.othersPercent}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, othersPercent: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Imposto (%)
            </span>
            <input
              value={form.taxPercent}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, taxPercent: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Dias de pagamento
            </span>
            <input
              value={form.payoutDays}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, payoutDays: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="1 ou 1,15"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar rateio"}
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Soma responsável + demais deve ser 100%. Pagamento padrão é no dia 1 (mês
          seguinte ao mês de referência), mas você pode definir outros dias.
        </div>
        <div className="mt-1 text-xs font-medium text-slate-700">
          Soma atual: {sumPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
            Percentual por funcionário (pool dos demais)
          </div>
          <div className="grid gap-2">
            {employeeShares.map((row) => (
              <div
                key={row.employeeId}
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-[1fr_140px]"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{row.name}</div>
                  <div className="text-xs text-slate-500">@{row.login}</div>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">%</span>
                  <input
                    value={row.percent}
                    onChange={(e) =>
                      setEmployeeShares((prev) =>
                        prev.map((item) =>
                          item.employeeId === row.employeeId
                            ? { ...item, percent: e.target.value }
                            : item
                        )
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs font-medium text-slate-700">
            Soma dos funcionários:{" "}
            {employeeSharesSum.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
          </div>
          <div className="text-xs text-slate-500">
            Essa soma deve ficar em 100%. Na distribuição, o responsável da venda é
            excluído e os demais recebem proporcionalmente a esses percentuais.
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
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
          <div className="text-xs text-slate-500">
            Última atualização da regra:{" "}
            {settingData ? formatDateTime(settingData.setting.updatedAt) : "—"}
          </div>
        </div>

        {clientesData && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                <div className="text-xs text-cyan-700">Pago no mês</div>
                <div className="text-xl font-bold text-cyan-900">
                  {formatMoney(clientesData.totals.totalPaidCents)}
                </div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="text-xs text-rose-700">Imposto retido</div>
                <div className="text-xl font-bold text-rose-900">
                  {formatMoney(clientesData.totals.totalTaxCents)}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs text-emerald-700">Lucro distribuível</div>
                <div className="text-xl font-bold text-emerald-900">
                  {formatMoney(clientesData.totals.totalNetCents)}
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-600">
              Pagamento previsto para este mês de referência:{" "}
              {settingData?.payoutDates?.length
                ? settingData.payoutDates
                    .map((value) => {
                      const d = new Date(value);
                      return Number.isNaN(d.getTime())
                        ? "—"
                        : d.toLocaleDateString("pt-BR");
                    })
                    .join(" • ")
                : "—"}
            </div>

            <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Funcionário</th>
                    <th className="px-3 py-2 text-left">% funcionário</th>
                    <th className="px-3 py-2 text-left">Recebido (clientes dele)</th>
                    <th className="px-3 py-2 text-left">Ganho no mês</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesData.rows.map((row) => (
                    <tr key={row.employee.id} className="border-t border-slate-200">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">
                          {row.employee.name}
                        </div>
                        <div className="text-xs text-slate-500">@{row.employee.login}</div>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {row.othersSharePercent.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        %
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {formatMoney(row.ownPaidCents)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-emerald-700">
                        {formatMoney(row.earningCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
