"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AffiliateRow = {
  id: string;
  name: string;
  document: string;
  login: string | null;
  flightSalesLink: string | null;
  pointsPurchaseLink: string | null;
  commissionBps: number;
  isActive: boolean;
  hasAccess?: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { clients?: number };
  metrics?: {
    clientsCount: number;
    salesCount: number;
    totalSalesCents: number;
    totalProfitCents: number;
    totalCommissionCents: number;
    sales?: AffiliateSaleRow[];
  };
};

type AffiliateSaleRow = {
  id: string;
  numero: string;
  date: string;
  program: string;
  clientName: string;
  clientIdentifier: string;
  totalCents: number;
  profitCents: number;
  affiliateCommissionCents: number;
  paymentStatus: string;
};

type FormState = {
  name: string;
  document: string;
  login: string;
  password: string;
  flightSalesLink: string;
  pointsPurchaseLink: string;
  commissionPercent: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  document: "",
  login: "",
  password: "",
  flightSalesLink: "",
  pointsPurchaseLink: "",
  commissionPercent: "20",
  isActive: true,
};

function onlyDigits(value: string) {
  return (value || "").replace(/\D+/g, "");
}

function formatDocument(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value || "-";
}

function formatPercent(bps: number) {
  return `${(bps / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function formatMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function saleStatus(value: string) {
  if (value === "PAID") return "Pago";
  if (value === "CANCELED") return "Cancelado";
  return "Pendente";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  optional,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600">{label}</div>
        {optional ? <div className="text-[11px] text-slate-400">Opcional</div> : null}
      </div>
      <input
        type={type}
        className="w-full rounded-xl border px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export default function AfiliadosClient() {
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [portalUrl, setPortalUrl] = useState("/afiliado/login");

  const editing = useMemo(
    () => rows.find((row) => row.id === editingId) || null,
    [editingId, rows]
  );
  const detailsAffiliate = useMemo(
    () => rows.find((row) => row.id === detailsId) || null,
    [detailsId, rows]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.clients += row.metrics?.clientsCount || row._count?.clients || 0;
          acc.sales += row.metrics?.salesCount || 0;
          acc.salesCents += row.metrics?.totalSalesCents || 0;
          acc.profitCents += row.metrics?.totalProfitCents || 0;
          acc.commissionCents += row.metrics?.totalCommissionCents || 0;
          return acc;
        },
        { clients: 0, sales: 0, salesCents: 0, profitCents: 0, commissionCents: 0 }
      ),
    [rows]
  );

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("withSales", "1");
      if (search.trim()) params.set("q", search.trim());

      const r = await fetch(`/api/afiliados?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar afiliados.");
      setRows(j.data.affiliates || []);
    } catch (e: unknown) {
      setRows([]);
      setError(errorMessage(e, "Erro ao carregar afiliados."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      load(q);
    }, 250);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    setPortalUrl(`${window.location.origin}/afiliado/login`);
  }, []);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function startEdit(row: AffiliateRow) {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      document: row.document || "",
      login: row.login || "",
      password: "",
      flightSalesLink: row.flightSalesLink || "",
      pointsPurchaseLink: row.pointsPurchaseLink || "",
      commissionPercent: String(row.commissionBps / 100).replace(".", ","),
      isActive: row.isActive,
    });
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        document: onlyDigits(form.document),
        login: form.login.trim(),
        password: form.password,
        flightSalesLink: form.flightSalesLink.trim() || null,
        pointsPurchaseLink: form.pointsPurchaseLink.trim() || null,
        commissionPercent: form.commissionPercent.trim(),
        isActive: form.isActive,
      };

      const r = await fetch(editingId ? `/api/afiliados/${editingId}` : "/api/afiliados", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao salvar afiliado.");

      startNew();
      await load(q);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao salvar afiliado."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: AffiliateRow) {
    setError("");
    try {
      const r = await fetch(`/api/afiliados/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao alterar status.");
      await load(q);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao alterar status."));
    }
  }

  const passwordRequired = !editing || !editing.hasAccess;
  const canSave =
    form.name.trim().length > 1 &&
    (onlyDigits(form.document).length === 11 || onlyDigits(form.document).length === 14) &&
    form.login.trim().length >= 3 &&
    (!passwordRequired || form.password.length >= 4) &&
    form.flightSalesLink.trim().length > 0 &&
    form.pointsPurchaseLink.trim().length > 0 &&
    form.commissionPercent.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Afiliados</h1>
          <p className="text-sm text-slate-600">
            Parceiros que indicam venda de passagens e compra de pontos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load(q)}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            Novo afiliado
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Clientes indicados</div>
          <div className="mt-1 text-xl font-semibold">{totals.clients}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Vendas indicadas</div>
          <div className="mt-1 text-xl font-semibold">{totals.sales}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Total vendido</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(totals.salesCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Lucro dos indicados</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(totals.profitCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Comissão prevista</div>
          <div className="mt-1 text-xl font-semibold text-emerald-700">
            {formatMoney(totals.commissionCents)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">
              {editing ? "Editar afiliado" : "Cadastrar afiliado"}
            </h2>
            <p className="text-xs text-slate-500">
              Link do portal para enviar ao afiliado:{" "}
              <span className="font-medium text-slate-700">{portalUrl}</span>
            </p>
          </div>
          {editing ? (
            <span className="rounded-full border px-3 py-1 text-xs text-slate-600">
              Editando {editing.name}
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Nome"
            value={form.name}
            onChange={(value) => setField("name", value)}
            placeholder="Ex: Agência parceira / João Silva"
          />
          <Input
            label="CPF/CNPJ"
            value={form.document}
            onChange={(value) => setField("document", value)}
            placeholder="Somente números ou formatado"
          />
          <Input
            label="Login do afiliado"
            value={form.login}
            onChange={(value) => setField("login", value)}
            placeholder="Ex: parceiro.sul"
          />
          <Input
            label={editing ? "Nova senha" : "Senha"}
            value={form.password}
            onChange={(value) => setField("password", value)}
            placeholder={editing ? "Deixe em branco para manter" : "Mínimo 4 caracteres"}
            optional={Boolean(editing?.hasAccess)}
            type="password"
          />
          <Input
            label="Link para venda de passagens"
            value={form.flightSalesLink}
            onChange={(value) => setField("flightSalesLink", value)}
            placeholder="https://..."
            type="url"
          />
          <Input
            label="Link para compra de pontos"
            value={form.pointsPurchaseLink}
            onChange={(value) => setField("pointsPurchaseLink", value)}
            placeholder="https://..."
            type="url"
          />
          <Input
            label="Percentual de comissão"
            value={form.commissionPercent}
            onChange={(value) => setField("commissionPercent", value)}
            placeholder="Ex: 5 ou 2,5"
          />
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
            />
            Afiliado ativo
          </label>
        </div>

        {error ? <div className="text-sm text-rose-600">{error}</div> : null}

        <div className="flex flex-wrap justify-end gap-2">
          {editing ? (
            <button
              type="button"
              onClick={startNew}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar edição
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Lista de afiliados</h2>
            <p className="text-xs text-slate-500">
              {rows.length} registro(s) encontrado(s)
            </p>
          </div>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm sm:max-w-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou link..."
          />
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-slate-600">
            {loading ? "Carregando afiliados..." : "Nenhum afiliado cadastrado ainda."}
          </div>
        ) : (
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">CPF/CNPJ</th>
                  <th className="px-3 py-2 text-left">Login</th>
                  <th className="px-3 py-2 text-left">Comissão</th>
                  <th className="px-3 py-2 text-left">Performance</th>
                  <th className="px-3 py-2 text-left">Links</th>
                  <th className="px-3 py-2 text-left">Clientes</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Criado em</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2">{formatDocument(row.document)}</td>
                    <td className="px-3 py-2">
                      <div>{row.login || "-"}</div>
                      <div className="text-xs text-slate-500">
                        {row.hasAccess ? "acesso liberado" : "sem senha"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{formatPercent(row.commissionBps)}</td>
                    <td className="px-3 py-2">
                      <div>{row.metrics?.salesCount || 0} venda(s)</div>
                      <div className="text-xs text-slate-500">
                        Vendido {formatMoney(row.metrics?.totalSalesCents || 0)}
                      </div>
                      <div className="text-xs text-emerald-700">
                        Comissão {formatMoney(row.metrics?.totalCommissionCents || 0)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.flightSalesLink ? (
                          <a
                            href={row.flightSalesLink}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border px-2 py-1 text-xs hover:bg-white"
                          >
                            Passagens
                          </a>
                        ) : null}
                        {row.pointsPurchaseLink ? (
                          <a
                            href={row.pointsPurchaseLink}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border px-2 py-1 text-xs hover:bg-white"
                          >
                            Pontos
                          </a>
                        ) : null}
                        {!row.flightSalesLink && !row.pointsPurchaseLink ? "-" : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">{row._count?.clients || 0}</td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "rounded-full px-2 py-1 text-xs",
                          row.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {row.isActive ? "ATIVO" : "INATIVO"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{dateBR(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsId((current) => (current === row.id ? null : row.id))}
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                        >
                          Detalhes
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(row)}
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                        >
                          {row.isActive ? "Inativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detailsAffiliate ? (
          <div className="mt-5 rounded-2xl border p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">{detailsAffiliate.name}</h3>
                <p className="text-xs text-slate-500">
                  Clientes indicados: {detailsAffiliate.metrics?.clientsCount || 0} · vendas:{" "}
                  {detailsAffiliate.metrics?.salesCount || 0} · comissão:{" "}
                  {formatMoney(detailsAffiliate.metrics?.totalCommissionCents || 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsId(null)}
                className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
              >
                Fechar
              </button>
            </div>

            {(detailsAffiliate.metrics?.sales || []).length === 0 ? (
              <div className="text-sm text-slate-600">
                Nenhuma venda encontrada para os clientes indicados por este afiliado.
              </div>
            ) : (
              <div className="overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Venda</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">Programa</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Lucro</th>
                      <th className="px-3 py-2 text-right">Comissão</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailsAffiliate.metrics?.sales || []).map((sale) => (
                      <tr key={sale.id} className="border-t hover:bg-slate-50">
                        <td className="px-3 py-2">{dateBR(sale.date)}</td>
                        <td className="px-3 py-2 font-medium">{sale.numero}</td>
                        <td className="px-3 py-2">
                          <div>{sale.clientName}</div>
                          <div className="text-xs text-slate-500">{sale.clientIdentifier}</div>
                        </td>
                        <td className="px-3 py-2">{sale.program}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatMoney(sale.totalCents)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(sale.profitCents)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                          {formatMoney(sale.affiliateCommissionCents)}
                        </td>
                        <td className="px-3 py-2">{saleStatus(sale.paymentStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
