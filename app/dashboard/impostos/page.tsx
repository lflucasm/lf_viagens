"use client";

import { useEffect, useMemo, useState } from "react";

type PaidByLite = { id: string; name: string } | null;

type MonthRow = {
  month: string; // YYYY-MM
  taxCents: number;
  payoutTaxCents: number;
  balcaoTaxCents: number;
  usersCount: number;
  daysCount: number;
  balcaoOpsCount: number;

  paidAt: string | null;
  paidBy: PaidByLite;

  // se pago, esse é o snapshot salvo
  snapshotTaxCents: number | null;
  snapshotPayoutTaxCents: number | null;
  snapshotBalcaoTaxCents: number | null;
};

type MonthsResponse = {
  ok: true;
  months: MonthRow[];
  totals: {
    tax: number;
    taxPayout: number;
    taxBalcao: number;
    paid: number;
    paidPayout: number;
    paidBalcao: number;
    pending: number;
    pendingPayout: number;
    pendingBalcao: number;
    monthsPaid: number;
    monthsPending: number;
  };
};

type MonthBreakItem = {
  userId: string;
  name: string;
  login: string;
  taxCents: number;
  daysCount: number;
};

type MonthDetailResponse = {
  ok: true;
  month: string;
  totalTaxCents: number;
  payoutTaxCents: number;
  balcaoTaxCents: number;
  balcaoOperationsCount: number;
  breakdown: MonthBreakItem[];

  paidAt: string | null;
  paidBy: PaidByLite;

  source: "SNAPSHOT" | "COMPUTED";
};

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR");
}

function todayISORecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthFromISODate(dateISO: string) {
  return String(dateISO || "").slice(0, 7);
}
function toISODateInput(v?: string | null) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });

  let json: { ok?: boolean; error?: string } | null = null;
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {}

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado/sem permissão (cookie tm.session não chegou)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });

  let json: { ok?: boolean; error?: string } | null = null;
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {}

  if (!res.ok || !json?.ok) {
    const msg =
      json?.error ||
      (res.status === 401 || res.status === 403
        ? "Não autenticado/sem permissão (cookie tm.session não chegou)"
        : `Erro (${res.status})`);
    throw new Error(msg);
  }

  return json as T;
}

function KPI({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "amber" | "blue" | "violet";
}) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/70"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50/80"
      : tone === "blue"
      ? "border-sky-200 bg-sky-50/80"
      : tone === "violet"
      ? "border-indigo-200 bg-indigo-50/80"
      : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${toneCls}`}>
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div className="text-lg font-bold tracking-tight text-neutral-800">{value}</div>
    </div>
  );
}

function Pill({ kind, text }: { kind: "ok" | "warn" | "muted"; text: string }) {
  const cls =
    kind === "ok"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : kind === "warn"
      ? "border border-amber-200 bg-amber-50 text-amber-700"
      : "border border-neutral-200 bg-neutral-100 text-neutral-700";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{text}</span>;
}

function getErrorMessage(e: unknown) {
  if (e instanceof Error && e.message) return e.message;
  return String(e);
}

export default function ImpostosPage() {
  const [data, setData] = useState<MonthsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState<{ title: string; desc?: string } | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [taxPercentInput, setTaxPercentInput] = useState("");
  const [taxEffectiveFromInput, setTaxEffectiveFromInput] = useState("");

  // drawer mês
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<string>(() => monthFromISODate(todayISORecife()));
  const [detail, setDetail] = useState<MonthDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // “Pagando...” por mês
  const [payingMonth, setPayingMonth] = useState<string | null>(null);

  const currentMonth = useMemo(() => monthFromISODate(todayISORecife()), []);
  const canPayMonth = useMemo(() => month < currentMonth, [month, currentMonth]);

  async function loadMonths() {
    setLoading(true);
    try {
      const res = await apiGet<MonthsResponse>(`/api/taxes/months?limit=24`);
      setData(res);
    } catch (e: unknown) {
      setToast({ title: "Falha ao carregar impostos", desc: getErrorMessage(e) });
      setData({
        ok: true,
        months: [],
        totals: {
          tax: 0,
          taxPayout: 0,
          taxBalcao: 0,
          paid: 0,
          paidPayout: 0,
          paidBalcao: 0,
          pending: 0,
          pendingPayout: 0,
          pendingBalcao: 0,
          monthsPaid: 0,
          monthsPending: 0,
        },
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const res = await apiGet<{ ok: true; data: { taxPercent: number; taxEffectiveFrom: string | null } }>(
        "/api/taxes/settings"
      );
      setTaxPercentInput(String(res.data.taxPercent ?? 8));
      setTaxEffectiveFromInput(toISODateInput(res.data.taxEffectiveFrom || null));
    } catch (e: unknown) {
      setToast({ title: "Falha ao carregar imposto", desc: getErrorMessage(e) });
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      await apiPost<{ ok: true }>(`/api/taxes/settings`, {
        taxPercent: taxPercentInput,
        taxEffectiveFrom: taxEffectiveFromInput || null,
      });
      await loadSettings();
      setToast({ title: "Imposto atualizado", desc: "Percentual salvo com sucesso." });
    } catch (e: unknown) {
      setToast({ title: "Falha ao salvar imposto", desc: getErrorMessage(e) });
    } finally {
      setSettingsSaving(false);
    }
  }

  async function loadMonth(m: string) {
    setDetailLoading(true);
    try {
      const res = await apiGet<MonthDetailResponse>(
        `/api/taxes/month?month=${encodeURIComponent(m)}`
      );
      setDetail(res);
    } catch (e: unknown) {
      setDetail(null);
      setToast({ title: "Falha ao carregar mês", desc: getErrorMessage(e) });
    } finally {
      setDetailLoading(false);
    }
  }

  async function openMonth(m: string) {
    setMonth(m);
    setOpen(true);
    await loadMonth(m);
  }

  async function payMonth(m: string) {
    setPayingMonth(m);
    try {
      await apiPost<{ ok: true }>(`/api/taxes/pay`, { month: m });
      await loadMonths();
      if (open && month === m) await loadMonth(m);
      setToast({ title: "Pago!", desc: `Imposto do mês ${m} marcado como pago.` });
    } catch (e: unknown) {
      setToast({ title: "Falha ao pagar mês", desc: getErrorMessage(e) });
    } finally {
      setPayingMonth(null);
    }
  }

  useEffect(() => {
    loadMonths();
    loadSettings();
  }, []);

  const totals = data?.totals || {
    tax: 0,
    taxPayout: 0,
    taxBalcao: 0,
    paid: 0,
    paidPayout: 0,
    paidBalcao: 0,
    pending: 0,
    pendingPayout: 0,
    pendingBalcao: 0,
    monthsPaid: 0,
    monthsPending: 0,
  };

  const taxRuleLabel = `${taxPercentInput || "8"}%${
    taxEffectiveFromInput ? ` desde ${toISODateInput(taxEffectiveFromInput)}` : ""
  }`;

  return (
    <div className="space-y-5 bg-gradient-to-br from-sky-50/40 via-white to-emerald-50/30 p-4 md:p-5">
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Impostos • Funcionários</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-200">
            Consolida o imposto mensal somando <b>venda de milhas</b> (<b>tax7Cents</b> dos{" "}
            <b>EmployeePayout</b>) + <b>emissões no balcão</b> (imposto sobre lucro), com controle de pagamento por mês.
          </p>
          <div className="mt-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
            Regra atual: {taxRuleLabel}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={loadMonths}
              disabled={loading}
              className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Carregando..." : "Atualizar"}
            </button>
            <button
              onClick={() => openMonth(month)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50"
              title="Abrir detalhes do mês"
            >
              Ver mês
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mês (YYYY-MM)</label>
            <input
              value={month}
              onChange={(e) => setMonth(e.target.value.slice(0, 7))}
              placeholder="YYYY-MM"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </div>

          <button
            onClick={() => payMonth(month)}
            disabled={!canPayMonth || payingMonth === month}
            className="mt-3 h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            title={
              canPayMonth
                ? "Marcar imposto do mês como pago"
                : "Só paga mês fechado (anterior ao mês atual)"
            }
          >
            {payingMonth === month ? "Pagando..." : "Pagar mês"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <KPI label="Imposto total (período)" value={fmtMoneyBR(totals.tax)} tone="blue" />
        <KPI label="Imposto venda de milhas" value={fmtMoneyBR(totals.taxPayout)} tone="violet" />
        <KPI label="Imposto emissões balcão" value={fmtMoneyBR(totals.taxBalcao)} tone="amber" />
        <KPI label="Imposto pago" value={fmtMoneyBR(totals.paid)} tone="emerald" />
        <KPI label="Imposto pendente" value={fmtMoneyBR(totals.pending)} tone="slate" />
      </div>

      <div className="text-xs text-slate-600">
        Meses pagos: <b>{totals.monthsPaid}</b> • Meses pendentes: <b>{totals.monthsPending}</b>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">Configuração de imposto</div>
            <div className="text-xs text-slate-600">
              Define a partir de qual data o novo percentual passa a valer no cálculo diário.
            </div>
          </div>
          <button
            onClick={loadSettings}
            className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            disabled={settingsLoading}
          >
            {settingsLoading ? "Atualizando..." : "Recarregar"}
          </button>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Percentual (%)</label>
            <input
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              value={taxPercentInput}
              onChange={(e) => setTaxPercentInput(e.target.value)}
              placeholder="Ex: 15"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">A partir do dia</label>
            <input
              type="date"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              value={taxEffectiveFromInput}
              onChange={(e) => setTaxEffectiveFromInput(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={saveSettings}
              className="h-11 w-full min-w-[220px] rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={settingsSaving}
            >
              {settingsSaving ? "Salvando..." : "Salvar percentual"}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs font-semibold uppercase tracking-wide text-slate-200">
              <tr>
                <th className="px-4 py-3">Mês</th>
                <th className="px-4 py-3">Total imposto</th>
                <th className="px-4 py-3">Venda milhas</th>
                <th className="px-4 py-3">Emissões balcão</th>
                <th className="px-4 py-3 text-right">Funcionários</th>
                <th className="px-4 py-3 text-right">Dias</th>
                <th className="px-4 py-3 text-right">Ops balcão</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {(data?.months || []).map((m) => {
                const isPaid = !!m.paidAt;
                const canPay = !isPaid && m.month < currentMonth;
                const paying = payingMonth === m.month;

                const shownTax =
                  isPaid && m.snapshotTaxCents !== null ? m.snapshotTaxCents : m.taxCents;
                const shownPayoutTax =
                  isPaid && m.snapshotPayoutTaxCents !== null
                    ? m.snapshotPayoutTaxCents
                    : m.payoutTaxCents;
                const shownBalcaoTax =
                  isPaid && m.snapshotBalcaoTaxCents !== null
                    ? m.snapshotBalcaoTaxCents
                    : m.balcaoTaxCents;

                return (
                  <tr key={m.month} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-800">{m.month}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{fmtMoneyBR(shownTax)}</td>
                    <td className="px-4 py-3 font-semibold text-indigo-700">{fmtMoneyBR(shownPayoutTax)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-700">{fmtMoneyBR(shownBalcaoTax)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{m.usersCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{m.daysCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{m.balcaoOpsCount}</td>
                    <td className="px-4 py-3">
                      {isPaid ? (
                        <div className="space-y-1">
                          <Pill kind="ok" text="PAGO" />
                          <div className="text-xs text-neutral-500">
                            {m.paidBy?.name ? `por ${m.paidBy.name}` : ""}
                            {m.paidAt ? ` • ${fmtDateTimeBR(m.paidAt)}` : ""}
                          </div>
                        </div>
                      ) : (
                        <Pill kind={m.month < currentMonth ? "warn" : "muted"} text="PENDENTE" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openMonth(m.month)}
                          className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold hover:bg-slate-50"
                        >
                          Detalhes
                        </button>

                        <button
                          onClick={() => payMonth(m.month)}
                          disabled={!canPay || paying}
                          className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          title={
                            canPay
                              ? "Marcar mês como pago"
                              : isPaid
                              ? "Já pago"
                              : "Só paga mês fechado (anterior ao mês atual)"
                          }
                        >
                          {paying ? "Pagando..." : "Pagar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!data?.months?.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={9}>
                    Sem dados (ou ainda não autenticado).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Dica: o total mensal soma <b>imposto da venda de milhas</b> (employee_payouts) + <b>imposto de emissões no
        balcão</b> (sobre lucro sem taxa).
      </div>

      {/* Drawer mês */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[560px] border-l border-slate-200 bg-gradient-to-b from-white via-slate-50 to-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white/70 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Imposto do mês</div>
                <div className="text-xs text-neutral-500">
                  <span className="font-medium">{month}</span>{" "}
                  {month >= currentMonth ? (
                    <span className="ml-2 text-amber-700">• mês atual/futuro (pode mudar)</span>
                  ) : null}
                </div>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-end justify-between gap-2">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mês (YYYY-MM)</label>
                  <input
                    value={month}
                    onChange={(e) => setMonth(e.target.value.slice(0, 7))}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => loadMonth(month)}
                    disabled={detailLoading}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                  >
                    {detailLoading ? "Carregando..." : "Atualizar"}
                  </button>

                  <button
                    onClick={() => payMonth(month)}
                    disabled={!canPayMonth || payingMonth === month}
                    className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    title={
                      canPayMonth
                        ? "Marcar imposto do mês como pago"
                        : "Só paga mês fechado (anterior ao mês atual)"
                    }
                  >
                    {payingMonth === month ? "Pagando..." : "Pagar mês"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Total imposto</div>
                  <div className="text-sm font-bold text-slate-900">
                    {fmtMoneyBR(detail?.totalTaxCents || 0)}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-2 py-1">
                    <div className="text-[11px] text-slate-500">Venda de milhas</div>
                    <div className="text-sm font-semibold text-indigo-700">
                      {fmtMoneyBR(detail?.payoutTaxCents || 0)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-2 py-1">
                    <div className="text-[11px] text-slate-500">Emissões balcão</div>
                    <div className="text-sm font-semibold text-amber-700">
                      {fmtMoneyBR(detail?.balcaoTaxCents || 0)}
                    </div>
                  </div>
                </div>

                <div className="mt-1 text-xs text-neutral-500">
                  Fonte: {detail?.source === "SNAPSHOT" ? "snapshot pago" : "calculado (employee_payouts + balcão)"}{" "}
                  {detail?.paidAt ? `• pago ${fmtDateTimeBR(detail.paidAt)}${detail?.paidBy?.name ? ` por ${detail.paidBy.name}` : ""}` : "• pendente"}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Operações balcão no mês: <b>{detail?.balcaoOperationsCount || 0}</b>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="max-h-[62vh] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Funcionário (venda de milhas)</th>
                        <th className="px-4 py-3 text-right">Dias</th>
                        <th className="px-4 py-3 text-right">Imposto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.breakdown || []).map((b) => (
                        <tr key={b.userId} className="border-t border-slate-100 hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{b.name}</div>
                            <div className="text-xs text-neutral-500">{b.login}</div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{b.daysCount}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800">
                            {fmtMoneyBR(b.taxCents)}
                          </td>
                        </tr>
                      ))}

                      {!detail?.breakdown?.length && (
                        <tr>
                          <td className="px-4 py-8 text-center text-sm text-neutral-500" colSpan={3}>
                            Sem dados de venda de milhas neste mês.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Aqui você vê a composição: <b>venda de milhas</b> (tax7Cents dos payouts) + <b>emissões no balcão</b>
                (imposto aplicado sobre lucro da operação).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-[360px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <div className="text-sm font-bold text-slate-900">{toast.title}</div>
          {toast.desc ? <div className="text-xs text-slate-600">{toast.desc}</div> : null}
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setToast(null)}
              className="rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
