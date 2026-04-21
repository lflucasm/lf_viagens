"use client";

import { Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";

type Airline =
  | "LATAM"
  | "SMILES"
  | "AZUL"
  | "TAP"
  | "IBERIA"
  | "FLYING_BLUE"
  | "COPA_AIRLINES"
  | "UNITED";

type ClienteOption = {
  id: string;
  identificador: string;
  nome: string;
  cpfCnpj?: string | null;
  telefone?: string | null;
};

type EmployeeOption = {
  id: string;
  name: string;
  login: string;
};

type Row = {
  id: string;
  airline: Airline;
  points: number;
  buyRateCents: number;
  sellRateCents: number;
  boardingFeeCents: number;
  supplierPayCents: number;
  customerChargeCents: number;
  profitCents: number;
  taxPercent: number;
  taxCents: number;
  netProfitCents: number;
  sellerCommissionCents: number;
  locator: string | null;
  note: string | null;
  createdAt: string;
  supplierCliente: ClienteOption;
  finalCliente: ClienteOption;
  employee: EmployeeOption | null;
};

type Resumo = {
  totalSupplierPayCents: number;
  totalCustomerChargeCents: number;
  totalProfitCents: number;
  totalTaxCents: number;
  totalNetProfitCents: number;
  totalSellerCommissionCents: number;
};

type TaxRule = {
  defaultPercent: number;
  configuredPercent: number;
  effectiveISO: string | null;
};

type FormState = {
  supplierClienteId: string;
  finalClienteId: string;
  employeeId: string;
  airline: Airline;
  points: string;
  buyRate: string;
  sellRate: string;
  boardingFee: string;
  locator: string;
  note: string;
};

type ClienteApiItem = {
  id?: unknown;
  identificador?: unknown;
  nome?: unknown;
  cpfCnpj?: unknown;
  telefone?: unknown;
};

type FuncionarioApiItem = {
  id?: unknown;
  name?: unknown;
  login?: unknown;
  team?: unknown;
};

const AIRLINES: Array<{ value: Airline; label: string }> = [
  { value: "LATAM", label: "Latam" },
  { value: "SMILES", label: "Smiles" },
  { value: "AZUL", label: "Azul" },
  { value: "TAP", label: "TAP" },
  { value: "IBERIA", label: "Iberia" },
  { value: "FLYING_BLUE", label: "Flying Blue" },
  { value: "COPA_AIRLINES", label: "Copa Airlines" },
  { value: "UNITED", label: "United" },
];

function parsePoints(v: string) {
  const digits = String(v || "").replace(/\D+/g, "");
  const n = Number(digits || "0");
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parseMoneyToCents(v: string) {
  const raw = String(v || "").trim();
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function formatMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatRate(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPoints(points: number) {
  return Number(points || 0).toLocaleString("pt-BR");
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function todayISORecife() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function resolveTaxPercentForDate(dateISO: string, rule: TaxRule) {
  const defaultPercent = Number(rule?.defaultPercent || 8);
  const configuredPercent = Number(rule?.configuredPercent || defaultPercent);
  if (!rule?.effectiveISO) return defaultPercent;
  return dateISO >= rule.effectiveISO ? configuredPercent : defaultPercent;
}

function getErrorMessage(e: unknown, fallback: string) {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export default function CompraVendaClient() {
  const [supplierOptions, setSupplierOptions] = useState<ClienteOption[]>([]);
  const [finalClientOptions, setFinalClientOptions] = useState<ClienteOption[]>([]);
  const [supplierQ, setSupplierQ] = useState("");
  const [finalClientQ, setFinalClientQ] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<ClienteOption | null>(null);
  const [selectedFinalClient, setSelectedFinalClient] = useState<ClienteOption | null>(null);
  const [loadingSupplierOptions, setLoadingSupplierOptions] = useState(false);
  const [loadingFinalClientOptions, setLoadingFinalClientOptions] = useState(false);
  const [supplierOptionsError, setSupplierOptionsError] = useState("");
  const [finalClientOptionsError, setFinalClientOptionsError] = useState("");
  const [funcionarios, setFuncionarios] = useState<EmployeeOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [resumo, setResumo] = useState<Resumo>({
    totalSupplierPayCents: 0,
    totalCustomerChargeCents: 0,
    totalProfitCents: 0,
    totalTaxCents: 0,
    totalNetProfitCents: 0,
    totalSellerCommissionCents: 0,
  });
  const [taxRule, setTaxRule] = useState<TaxRule>({
    defaultPercent: 8,
    configuredPercent: 8,
    effectiveISO: null,
  });

  const [form, setForm] = useState<FormState>({
    supplierClienteId: "",
    finalClienteId: "",
    employeeId: "",
    airline: "LATAM",
    points: "",
    buyRate: "",
    sellRate: "",
    boardingFee: "0",
    locator: "",
    note: "",
  });

  const pointsValue = useMemo(() => parsePoints(form.points), [form.points]);
  const buyRateCents = useMemo(() => parseMoneyToCents(form.buyRate), [form.buyRate]);
  const sellRateCents = useMemo(() => parseMoneyToCents(form.sellRate), [form.sellRate]);
  const boardingFeeCents = useMemo(
    () => parseMoneyToCents(form.boardingFee),
    [form.boardingFee]
  );

  const previewSupplierPayCents = useMemo(
    () => Math.round((pointsValue * buyRateCents) / 1000),
    [pointsValue, buyRateCents]
  );

  const previewCustomerChargeCents = useMemo(
    () => Math.round((pointsValue * sellRateCents) / 1000) + boardingFeeCents,
    [pointsValue, sellRateCents, boardingFeeCents]
  );

  const previewProfitCents = useMemo(
    () => previewCustomerChargeCents - previewSupplierPayCents - boardingFeeCents,
    [previewCustomerChargeCents, previewSupplierPayCents, boardingFeeCents]
  );
  const previewTaxPercent = useMemo(
    () => resolveTaxPercentForDate(todayISORecife(), taxRule),
    [taxRule]
  );
  const previewTaxCents = useMemo(
    () => Math.round(Math.max(0, previewProfitCents) * (previewTaxPercent / 100)),
    [previewProfitCents, previewTaxPercent]
  );
  const previewNetProfitCents = useMemo(
    () => previewProfitCents - previewTaxCents,
    [previewProfitCents, previewTaxCents]
  );
  const previewSellerCommissionCents = useMemo(
    () => Math.round(Math.max(0, previewNetProfitCents) * 0.6),
    [previewNetProfitCents]
  );

  const loadRows = useCallback(async (search = "") => {
    const query = search.trim();
    const url = query
      ? `/api/emissoes-balcao?q=${encodeURIComponent(query)}`
      : "/api/emissoes-balcao";

    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      data?: { rows?: Row[]; resumo?: Resumo; taxRule?: Partial<TaxRule> };
    };

    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Erro ao carregar operações.");
    }

    setRows(Array.isArray(data?.data?.rows) ? data.data.rows : []);
    setResumo({
      totalSupplierPayCents: Number(data?.data?.resumo?.totalSupplierPayCents || 0),
      totalCustomerChargeCents: Number(data?.data?.resumo?.totalCustomerChargeCents || 0),
      totalProfitCents: Number(data?.data?.resumo?.totalProfitCents || 0),
      totalTaxCents: Number(data?.data?.resumo?.totalTaxCents || 0),
      totalNetProfitCents: Number(data?.data?.resumo?.totalNetProfitCents || 0),
      totalSellerCommissionCents: Number(data?.data?.resumo?.totalSellerCommissionCents || 0),
    });
    setTaxRule({
      defaultPercent: Number(data?.data?.taxRule?.defaultPercent || 8),
      configuredPercent: Number(data?.data?.taxRule?.configuredPercent || 8),
      effectiveISO:
        typeof data?.data?.taxRule?.effectiveISO === "string"
          ? data.data.taxRule.effectiveISO
          : null,
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [funcionariosRes, sessionRes] = await Promise.all([
        fetch("/api/funcionarios", { cache: "no-store" }),
        fetch("/api/session", { cache: "no-store" }),
      ]);

      const [funcionariosJson, sessionJson] = await Promise.all([
        funcionariosRes.json().catch(() => ({})),
        sessionRes.json().catch(() => ({})),
      ]);

      if (!funcionariosRes.ok || !funcionariosJson?.ok) {
        throw new Error(funcionariosJson?.error || "Erro ao carregar funcionários.");
      }

      const sessionTeam = String(sessionJson?.user?.team || "");
      const sessionUserId = String(sessionJson?.user?.id || "");

      const rawFuncionarios: FuncionarioApiItem[] = Array.isArray(funcionariosJson?.data)
        ? (funcionariosJson.data as FuncionarioApiItem[])
        : [];

      const listFuncionarios: EmployeeOption[] = rawFuncionarios
            .filter((u) => {
              if (!sessionTeam) return true;
              return String(u?.team || "") === sessionTeam;
            })
            .map((u) => ({
              id: String(u?.id || ""),
              name: String(u?.name || ""),
              login: String(u?.login || ""),
            }))
            .filter((u: EmployeeOption) => u.id && u.name)
            .sort((a: EmployeeOption, b: EmployeeOption) =>
              a.name.localeCompare(b.name, "pt-BR")
            );

      setFuncionarios(listFuncionarios);

      setForm((prev) => {
        const next = { ...prev };

        const hasSessionUser = listFuncionarios.some((f) => f.id === sessionUserId);
        if (!next.employeeId) {
          next.employeeId = hasSessionUser
            ? sessionUserId
            : listFuncionarios[0]?.id || "";
        }

        return next;
      });

      await loadRows("");
    } catch (e: unknown) {
      setRows([]);
      setResumo({
        totalSupplierPayCents: 0,
        totalCustomerChargeCents: 0,
        totalProfitCents: 0,
        totalTaxCents: 0,
        totalNetProfitCents: 0,
        totalSellerCommissionCents: 0,
      });
      setError(getErrorMessage(e, "Falha ao carregar dados da tela."));
    } finally {
      setLoading(false);
    }
  }, [loadRows]);

  const searchClientOptions = useCallback(
    async (
      search: string,
      setter: Dispatch<SetStateAction<ClienteOption[]>>,
      setLoadingState: Dispatch<SetStateAction<boolean>>,
      setErrorState: Dispatch<SetStateAction<string>>,
      selected: ClienteOption | null
    ) => {
      const query = search.trim();
      const isRecent = query.length < 2;

      setLoadingState(true);
      setErrorState("");

      try {
        const url = isRecent
          ? "/api/clientes/search?recent=1&limit=30"
          : `/api/clientes/search?q=${encodeURIComponent(query)}&limit=30`;

        const res = await fetch(url, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          clientes?: ClienteApiItem[];
          error?: string;
        };

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Erro ao buscar clientes.");
        }

        let list: ClienteOption[] = Array.isArray(data?.clientes)
          ? data.clientes
              .map((c) => ({
                id: String(c?.id || ""),
                identificador: String(c?.identificador || ""),
                nome: String(c?.nome || ""),
                cpfCnpj: typeof c?.cpfCnpj === "string" ? c.cpfCnpj : null,
                telefone: typeof c?.telefone === "string" ? c.telefone : null,
              }))
              .filter((c) => c.id && c.nome)
          : [];

        if (selected?.id && !list.some((c) => c.id === selected.id)) {
          list = [selected, ...list];
        }

        setter(list);
      } catch (e: unknown) {
        setter(selected ? [selected] : []);
        if (!isRecent) {
          setErrorState(getErrorMessage(e, "Erro ao buscar clientes."));
        }
      } finally {
        setLoadingState(false);
      }
    },
    []
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!form.supplierClienteId) {
      setSelectedSupplier(null);
      return;
    }

    const found = supplierOptions.find((c) => c.id === form.supplierClienteId);
    if (found) setSelectedSupplier(found);
  }, [form.supplierClienteId, supplierOptions]);

  useEffect(() => {
    if (!form.finalClienteId) {
      setSelectedFinalClient(null);
      return;
    }

    const found = finalClientOptions.find((c) => c.id === form.finalClienteId);
    if (found) setSelectedFinalClient(found);
  }, [form.finalClienteId, finalClientOptions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchClientOptions(
        supplierQ,
        setSupplierOptions,
        setLoadingSupplierOptions,
        setSupplierOptionsError,
        selectedSupplier
      ).catch(() => undefined);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchClientOptions, selectedSupplier, supplierQ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchClientOptions(
        finalClientQ,
        setFinalClientOptions,
        setLoadingFinalClientOptions,
        setFinalClientOptionsError,
        selectedFinalClient
      ).catch(() => undefined);
    }, 250);

    return () => clearTimeout(timer);
  }, [finalClientQ, searchClientOptions, selectedFinalClient]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.supplierClienteId) {
      alert("Selecione o fornecedor.");
      return;
    }
    if (!form.finalClienteId) {
      alert("Selecione o cliente final.");
      return;
    }
    if (form.supplierClienteId === form.finalClienteId) {
      alert("Fornecedor e cliente final devem ser diferentes.");
      return;
    }

    if (pointsValue <= 0) {
      alert("Informe a quantidade de pontos.");
      return;
    }
    if (buyRateCents <= 0) {
      alert("Informe o milheiro de compra.");
      return;
    }
    if (sellRateCents <= 0) {
      alert("Informe o milheiro de venda.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/emissoes-balcao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierClienteId: form.supplierClienteId,
          finalClienteId: form.finalClienteId,
          employeeId: form.employeeId,
          airline: form.airline,
          points: form.points,
          buyRate: form.buyRate,
          sellRate: form.sellRate,
          boardingFee: form.boardingFee,
          locator: form.locator,
          note: form.note,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao registrar operação.");
      }

      setForm((prev) => ({
        ...prev,
        points: "",
        locator: "",
        note: "",
      }));

      await loadRows(q);
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Falha ao salvar operação."));
    } finally {
      setSaving(false);
    }
  }

  const suppliers = supplierOptions;
  const finalClients = finalClientOptions;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Emissões no balcão — Compra e Venda</h1>
          <p className="text-sm text-zinc-600">
            Controle de operações entre fornecedor e cliente final sem impactar distribuição de lucros.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar fornecedor, cliente, funcionário ou localizador..."
            className="h-10 w-[320px] rounded border border-zinc-300 px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => loadRows(q).catch((err: unknown) => setError(getErrorMessage(err, "Erro ao atualizar lista.")))}
            className="h-10 rounded bg-zinc-900 px-4 text-sm text-white"
          >
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="rounded border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Total a pagar (fornecedores)</div>
          <div className="text-lg font-semibold">{formatMoney(resumo.totalSupplierPayCents)}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Total a receber (clientes finais)</div>
          <div className="text-lg font-semibold">{formatMoney(resumo.totalCustomerChargeCents)}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Lucro bruto (sem taxa)</div>
          <div className="text-lg font-semibold">{formatMoney(resumo.totalProfitCents)}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Imposto balcão (lucro)</div>
          <div className="text-lg font-semibold text-amber-700">{formatMoney(resumo.totalTaxCents)}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Lucro líquido (após imposto)</div>
          <div className="text-lg font-semibold text-emerald-700">{formatMoney(resumo.totalNetProfitCents)}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-white p-3">
          <div className="text-xs text-zinc-500">Comissão vendedor (60%)</div>
          <div className="text-lg font-semibold text-blue-700">
            {formatMoney(resumo.totalSellerCommissionCents)}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="rounded border border-zinc-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 text-sm">
            <span className="block text-zinc-700">Fornecedor</span>
            <input
              value={supplierQ}
              onChange={(e) => setSupplierQ(e.target.value)}
              placeholder="Buscar fornecedor por nome / ID / CPF / telefone..."
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={saving}
            />
            <select
              value={form.supplierClienteId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, supplierClienteId: e.target.value }))
              }
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={loading || saving}
            >
              <option value="">
                {loadingSupplierOptions ? "Buscando fornecedores..." : "Selecione..."}
              </option>
              {suppliers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.identificador} - {c.nome}
                </option>
              ))}
            </select>
            {supplierOptionsError ? (
              <div className="text-[11px] text-rose-600">{supplierOptionsError}</div>
            ) : null}
          </div>

          <div className="space-y-2 text-sm">
            <span className="block text-zinc-700">Cliente final</span>
            <input
              value={finalClientQ}
              onChange={(e) => setFinalClientQ(e.target.value)}
              placeholder="Buscar cliente por nome / ID / CPF / telefone..."
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={saving}
            />
            <select
              value={form.finalClienteId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, finalClienteId: e.target.value }))
              }
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={loading || saving}
            >
              <option value="">
                {loadingFinalClientOptions ? "Buscando clientes..." : "Selecione..."}
              </option>
              {finalClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.identificador} - {c.nome}
                </option>
              ))}
            </select>
            {finalClientOptionsError ? (
              <div className="text-[11px] text-rose-600">{finalClientOptionsError}</div>
            ) : null}
          </div>

          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">Funcionário</span>
            <select
              value={form.employeeId}
              onChange={(e) => setForm((prev) => ({ ...prev, employeeId: e.target.value }))}
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={loading || saving}
            >
              <option value="">Selecione...</option>
              {funcionarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.login})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">CIA aérea</span>
            <select
              value={form.airline}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, airline: e.target.value as Airline }))
              }
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={loading || saving}
            >
              {AIRLINES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">Pontos comprados</span>
            <input
              value={form.points}
              onChange={(e) => setForm((prev) => ({ ...prev, points: e.target.value }))}
              placeholder="Ex: 85000"
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={saving}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">Milheiro comprado (R$)</span>
            <input
              value={form.buyRate}
              onChange={(e) => setForm((prev) => ({ ...prev, buyRate: e.target.value }))}
              placeholder="Ex: 23,50"
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={saving}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">Milheiro vendido (R$)</span>
            <input
              value={form.sellRate}
              onChange={(e) => setForm((prev) => ({ ...prev, sellRate: e.target.value }))}
              placeholder="Ex: 27,90"
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={saving}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">Taxa de embarque (R$)</span>
            <input
              value={form.boardingFee}
              onChange={(e) => setForm((prev) => ({ ...prev, boardingFee: e.target.value }))}
              placeholder="Ex: 56,88"
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={saving}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">Localizador</span>
            <input
              value={form.locator}
              onChange={(e) => setForm((prev) => ({ ...prev, locator: e.target.value.toUpperCase() }))}
              placeholder="Ex: ABC123"
              className="h-10 w-full rounded border border-zinc-300 px-3"
              disabled={saving}
              maxLength={32}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-zinc-700">Observação (opcional)</span>
          <input
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="Descrição rápida da operação"
            className="h-10 w-full rounded border border-zinc-300 px-3"
            disabled={saving}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">Valor a pagar ao fornecedor</div>
            <div className="font-semibold">{formatMoney(previewSupplierPayCents)}</div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">Valor a ser pago pelo cliente final</div>
            <div className="font-semibold">{formatMoney(previewCustomerChargeCents)}</div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">Lucro da operação (sem taxa)</div>
            <div className="font-semibold">{formatMoney(previewProfitCents)}</div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">{`Imposto (${previewTaxPercent}%)`}</div>
            <div className="font-semibold text-amber-700">{formatMoney(previewTaxCents)}</div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">Lucro líquido (após imposto)</div>
            <div className="font-semibold text-emerald-700">{formatMoney(previewNetProfitCents)}</div>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">Comissão vendedor (60%)</div>
            <div className="font-semibold text-blue-700">{formatMoney(previewSellerCommissionCents)}</div>
          </div>
        </div>

        <div className="text-xs text-zinc-500">
          Regra de imposto: {taxRule.effectiveISO ? `${taxRule.configuredPercent}% desde ${taxRule.effectiveISO}` : `${taxRule.defaultPercent}% (padrão)`}.
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || loading}
            className="h-10 rounded bg-zinc-900 px-4 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Registrar operação"}
          </button>
        </div>
      </form>

      <div className="rounded border border-zinc-200 bg-white overflow-x-auto">
        <table className="min-w-[1880px] w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left">
              <th className="p-3">Data</th>
              <th className="p-3">Fornecedor</th>
              <th className="p-3">Cliente final</th>
              <th className="p-3">CIA</th>
              <th className="p-3">Pontos</th>
              <th className="p-3">Milheiro compra</th>
              <th className="p-3">Milheiro venda</th>
              <th className="p-3">Taxa embarque</th>
              <th className="p-3">Pagar fornecedor</th>
              <th className="p-3">Receber cliente</th>
              <th className="p-3">Lucro (sem taxa)</th>
              <th className="p-3">Imposto</th>
              <th className="p-3">Lucro líquido</th>
              <th className="p-3">Comissão vendedor</th>
              <th className="p-3">Localizador</th>
              <th className="p-3">Funcionário</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={16}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={16}>
                  Nenhuma operação registrada.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 align-top">
                  <td className="p-3 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>

                  <td className="p-3">
                    <div className="font-medium">{row.supplierCliente.nome}</div>
                    <div className="text-xs text-zinc-500">{row.supplierCliente.identificador}</div>
                  </td>

                  <td className="p-3">
                    <div className="font-medium">{row.finalCliente.nome}</div>
                    <div className="text-xs text-zinc-500">{row.finalCliente.identificador}</div>
                  </td>

                  <td className="p-3 whitespace-nowrap">
                    {AIRLINES.find((a) => a.value === row.airline)?.label || row.airline}
                  </td>

                  <td className="p-3 whitespace-nowrap">{formatPoints(row.points)}</td>
                  <td className="p-3 whitespace-nowrap">R$ {formatRate(row.buyRateCents)}</td>
                  <td className="p-3 whitespace-nowrap">R$ {formatRate(row.sellRateCents)}</td>
                  <td className="p-3 whitespace-nowrap">{formatMoney(row.boardingFeeCents)}</td>
                  <td className="p-3 whitespace-nowrap font-medium">{formatMoney(row.supplierPayCents)}</td>
                  <td className="p-3 whitespace-nowrap font-medium">{formatMoney(row.customerChargeCents)}</td>
                  <td
                    className={`p-3 whitespace-nowrap font-semibold ${
                      row.profitCents >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {formatMoney(row.profitCents)}
                  </td>
                  <td className="p-3 whitespace-nowrap font-semibold text-amber-700">
                    {formatMoney(row.taxCents)}
                  </td>
                  <td
                    className={`p-3 whitespace-nowrap font-semibold ${
                      row.netProfitCents >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {formatMoney(row.netProfitCents)}
                  </td>
                  <td className="p-3 whitespace-nowrap font-semibold text-blue-700">
                    {formatMoney(row.sellerCommissionCents)}
                  </td>
                  <td className="p-3 whitespace-nowrap font-medium">{row.locator || "—"}</td>

                  <td className="p-3">
                    {row.employee ? (
                      <>
                        <div className="font-medium">{row.employee.name}</div>
                        <div className="text-xs text-zinc-500">@{row.employee.login}</div>
                      </>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
