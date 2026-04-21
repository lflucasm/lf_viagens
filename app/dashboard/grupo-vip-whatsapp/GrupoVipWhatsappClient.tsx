"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LinkApiItem = {
  employee: {
    id: string;
    name: string;
    login: string;
    role: string;
  };
  link: {
    id: string;
    code: string;
    whatsappE164: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type LeadApiItem = {
  id: string;
  fullName: string;
  birthDate: string;
  countryCode: string;
  areaCode: string;
  phoneNumber: string;
  whatsappE164: string;
  originAirport: string;
  destinationAirport1: string;
  destinationAirport2: string;
  destinationAirport3: string;
  firstMonthCents: number;
  recurringMonthCents: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt: string | null;
  approvedBy: { id: string; name: string; login: string } | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; name: string; login: string };
  link: { id: string; code: string; whatsappE164: string; isActive: boolean };
  totals: { totalPaidCents: number; paymentsCount: number };
  payments: Array<{
    id: string;
    monthRef: string | null;
    amountCents: number;
    note: string | null;
    paidAt: string;
    recordedBy: { id: string; name: string; login: string } | null;
  }>;
};

type LinksResponse = {
  ok?: boolean;
  error?: string;
  data?: LinkApiItem[];
};

type LeadsResponse = {
  ok?: boolean;
  error?: string;
  data?: LeadApiItem[];
};

type LinkDraft = {
  whatsappE164: string;
  isActive: boolean;
};

type PaymentDraft = {
  amount: string;
  monthRef: string;
  note: string;
};

function formatMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function defaultMonthRef() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildPromoWhatsappText(linkUrl: string) {
  return [
    "🔥 Quer receber alertas de passagens com chance de economizar?",
    "",
    "Entre no Grupo VIP WhatsApp da Vias Aéreas e receba alertas 3x por semana com oportunidades de voos.",
    "",
    "🎯 Você escolhe sua origem + até 3 destinos",
    "💸 1º mês por apenas R$ 9,90",
    "📌 Depois: R$ 14,90/mês via Pix",
    "",
    "✅ Sem fidelidade",
    "✅ Reembolso em até 7 dias",
    "",
    "📲 Cadastre-se agora:",
    linkUrl,
  ].join("\n");
}

function messageFromError(e: unknown, fallback: string) {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export default function GrupoVipWhatsappClient() {
  const [publicOrigin, setPublicOrigin] = useState("");

  const [links, setLinks] = useState<LinkApiItem[]>([]);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, LinkDraft>>({});
  const [savingLinkFor, setSavingLinkFor] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadApiItem[]>([]);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>(
    {}
  );
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PENDING" | "APPROVED" | "REJECTED"
  >("ALL");
  const [q, setQ] = useState("");

  const [loadingLinks, setLoadingLinks] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPublicOrigin(window.location.origin);
    }
  }, []);

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await fetch("/api/grupo-vip/links", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as LinksResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro ao carregar links.");
      }
      const rows = Array.isArray(data.data) ? data.data : [];
      setLinks(rows);
      setLinkDrafts((prev) => {
        const next: Record<string, LinkDraft> = { ...prev };
        for (const row of rows) {
          next[row.employee.id] = {
            whatsappE164: row.link?.whatsappE164 || prev[row.employee.id]?.whatsappE164 || "",
            isActive: row.link?.isActive ?? prev[row.employee.id]?.isActive ?? true,
          };
        }
        return next;
      });
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  const loadLeads = useCallback(
    async (status: "ALL" | "PENDING" | "APPROVED" | "REJECTED", query: string) => {
      setLoadingLeads(true);
      try {
        const params = new URLSearchParams();
        if (status !== "ALL") params.set("status", status);
        if (query.trim()) params.set("q", query.trim());

        const url = params.toString()
          ? `/api/grupo-vip/leads?${params.toString()}`
          : "/api/grupo-vip/leads";

        const res = await fetch(url, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as LeadsResponse;
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Erro ao carregar cadastros.");
        }
        const rows = Array.isArray(data.data) ? data.data : [];
        setLeads(rows);
      } finally {
        setLoadingLeads(false);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setError(null);
      try {
        await loadLinks();
      } catch (e) {
        if (!active) return;
        setError(messageFromError(e, "Falha ao carregar módulo Grupo VIP."));
      }
    })();
    return () => {
      active = false;
    };
  }, [loadLeads, loadLinks]);

  const summary = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let paid = 0;
    for (const lead of leads) {
      if (lead.status === "PENDING") pending += 1;
      if (lead.status === "APPROVED") approved += 1;
      if (lead.status === "REJECTED") rejected += 1;
      paid += Number(lead.totals?.totalPaidCents || 0);
    }
    return { total: leads.length, pending, approved, rejected, paid };
  }, [leads]);

  const promoByEmployee = useMemo(() => {
    return links.map((row) => {
      const linkUrl =
        row.link && publicOrigin
          ? `${publicOrigin}/grupo-vip/${row.link.code}`
          : row.link
          ? `/grupo-vip/${row.link.code}`
          : "";
      return {
        employeeId: row.employee.id,
        employeeName: row.employee.name,
        employeeLogin: row.employee.login,
        linkUrl,
        message: linkUrl ? buildPromoWhatsappText(linkUrl) : "",
      };
    });
  }, [links, publicOrigin]);

  function updateLinkDraft(employeeId: string, patch: Partial<LinkDraft>) {
    setLinkDrafts((prev) => ({
      ...prev,
      [employeeId]: {
        whatsappE164: prev[employeeId]?.whatsappE164 || "",
        isActive: prev[employeeId]?.isActive ?? true,
        ...patch,
      },
    }));
  }

  function updatePaymentDraft(leadId: string, patch: Partial<PaymentDraft>) {
    setPaymentDrafts((prev) => ({
      ...prev,
      [leadId]: {
        amount: prev[leadId]?.amount || "",
        monthRef: prev[leadId]?.monthRef || defaultMonthRef(),
        note: prev[leadId]?.note || "",
        ...patch,
      },
    }));
  }

  async function saveLink(employeeId: string) {
    const draft = linkDrafts[employeeId];
    if (!draft?.whatsappE164?.trim()) {
      alert("Informe o WhatsApp do funcionário no formato +55DDDNUMERO.");
      return;
    }

    setSavingLinkFor(employeeId);
    try {
      const res = await fetch("/api/grupo-vip/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          whatsappE164: draft.whatsappE164.trim(),
          isActive: draft.isActive,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro ao salvar link.");
      }
      await loadLinks();
    } catch (e) {
      alert(messageFromError(e, "Erro ao salvar link do funcionário."));
    } finally {
      setSavingLinkFor(null);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      alert("Copiado.");
    } catch {
      alert("Não foi possível copiar automaticamente.");
    }
  }

  const refreshLeads = useCallback(async () => {
    try {
      await loadLeads(statusFilter, q);
    } catch (e) {
      alert(messageFromError(e, "Erro ao atualizar cadastros."));
    }
  }, [loadLeads, q, statusFilter]);

  useEffect(() => {
    refreshLeads();
  }, [refreshLeads]);

  async function changeLeadStatus(
    leadId: string,
    status: "PENDING" | "APPROVED" | "REJECTED"
  ) {
    setSavingLeadId(leadId);
    try {
      const res = await fetch(`/api/grupo-vip/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro ao atualizar status.");
      }
      await refreshLeads();
    } catch (e) {
      alert(messageFromError(e, "Erro ao alterar status."));
    } finally {
      setSavingLeadId(null);
    }
  }

  async function saveLeadNote(leadId: string, internalNotes: string) {
    setSavingLeadId(leadId);
    try {
      const res = await fetch(`/api/grupo-vip/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internalNotes }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro ao salvar observação.");
      }
      await refreshLeads();
    } catch (e) {
      alert(messageFromError(e, "Erro ao salvar observação."));
    } finally {
      setSavingLeadId(null);
    }
  }

  async function addPayment(leadId: string) {
    const draft = paymentDrafts[leadId] || {
      amount: "",
      monthRef: defaultMonthRef(),
      note: "",
    };

    if (!draft.amount.trim()) {
      alert("Informe o valor do pagamento.");
      return;
    }

    setSavingLeadId(leadId);
    try {
      const res = await fetch(`/api/grupo-vip/leads/${leadId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: draft.amount,
          monthRef: draft.monthRef || null,
          note: draft.note || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erro ao registrar pagamento.");
      }

      setPaymentDrafts((prev) => ({
        ...prev,
        [leadId]: { amount: "", monthRef: draft.monthRef, note: "" },
      }));
      await refreshLeads();
    } catch (e) {
      alert(messageFromError(e, "Erro ao registrar pagamento."));
    } finally {
      setSavingLeadId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-8">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-emerald-50 via-cyan-50 to-blue-50 p-5">
        <h1 className="text-3xl font-black text-slate-900">Grupo VIP WhatsApp</h1>
        <p className="mt-1 text-sm text-slate-700">
          Links por funcionário + cadastro público + aprovação + controle manual de
          pagamentos.
        </p>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
          <div className="text-xs uppercase text-cyan-700">Cadastros</div>
          <div className="mt-1 text-2xl font-bold text-cyan-950">{summary.total}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs uppercase text-amber-700">Pendentes</div>
          <div className="mt-1 text-2xl font-bold text-amber-950">
            {summary.pending}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs uppercase text-emerald-700">Aprovados</div>
          <div className="mt-1 text-2xl font-bold text-emerald-950">
            {summary.approved}
          </div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs uppercase text-rose-700">Rejeitados</div>
          <div className="mt-1 text-2xl font-bold text-rose-950">{summary.rejected}</div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="text-xs uppercase text-violet-700">Total pago</div>
          <div className="mt-1 text-2xl font-bold text-violet-950">
            {formatMoney(summary.paid)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Links por funcionário</h2>
            <p className="text-sm text-slate-500">
              Cada link identifica automaticamente o responsável pelo cadastro.
            </p>
          </div>
          <button
            type="button"
            onClick={loadLinks}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>

        {loadingLinks ? (
          <div className="rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
            Carregando links...
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
            Nenhum funcionário encontrado.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((row) => {
              const draft = linkDrafts[row.employee.id] || {
                whatsappE164: "",
                isActive: true,
              };
              const linkUrl =
                row.link && publicOrigin
                  ? `${publicOrigin}/grupo-vip/${row.link.code}`
                  : row.link
                  ? `/grupo-vip/${row.link.code}`
                  : null;

              return (
                <div
                  key={row.employee.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-[1.4fr_1.2fr_auto_auto] md:items-end">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {row.employee.name}
                      </div>
                      <div className="text-xs text-slate-500">@{row.employee.login}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Código do link: {row.link?.code || "—"}
                      </div>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        WhatsApp do funcionário (+55DDDNUMERO)
                      </span>
                      <input
                        value={draft.whatsappE164}
                        onChange={(e) =>
                          updateLinkDraft(row.employee.id, {
                            whatsappE164: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                        placeholder="+5511999999999"
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(e) =>
                          updateLinkDraft(row.employee.id, {
                            isActive: e.target.checked,
                          })
                        }
                      />
                      Ativo
                    </label>

                    <button
                      type="button"
                      onClick={() => saveLink(row.employee.id)}
                      disabled={savingLinkFor === row.employee.id}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {savingLinkFor === row.employee.id ? "Salvando..." : "Salvar"}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {linkUrl ? (
                      <>
                        <a
                          href={linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Abrir link público
                        </a>
                        <button
                          type="button"
                          onClick={() => copyText(linkUrl)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Copiar link
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-500">
                        Salve para gerar o link do funcionário.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-slate-900">
            Mensagem de divulgação (WhatsApp)
          </h2>
          <p className="text-sm text-slate-500">
            Texto curto por funcionário com link individual de cadastro.
          </p>
        </div>

        {promoByEmployee.length === 0 ? (
          <div className="rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
            Nenhum funcionário disponível.
          </div>
        ) : (
          <div className="space-y-3">
            {promoByEmployee.map((item) => (
              <div
                key={item.employeeId}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="mb-2">
                  <div className="font-semibold text-slate-900">{item.employeeName}</div>
                  <div className="text-xs text-slate-500">@{item.employeeLogin}</div>
                </div>

                {item.linkUrl ? (
                  <>
                    <textarea
                      readOnly
                      value={item.message}
                      rows={6}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(item.message)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Copiar mensagem
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(item.linkUrl)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Copiar só o link
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-500">
                    Salve o WhatsApp desse funcionário para gerar a mensagem com link.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[210px] flex-1">
            <h2 className="text-xl font-bold text-slate-900">Cadastros recebidos</h2>
            <p className="text-sm text-slate-500">
              Mostra adesão, status de aprovação e pagamentos manuais.
            </p>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "ALL" | "PENDING" | "APPROVED" | "REJECTED"
                )
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ALL">Todos</option>
              <option value="PENDING">Pendente</option>
              <option value="APPROVED">Aprovado</option>
              <option value="REJECTED">Rejeitado</option>
            </select>
          </label>

          <label className="block min-w-[260px]">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Buscar
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, WhatsApp ou funcionário..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={refreshLeads}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Atualizar
          </button>
        </div>

        {loadingLeads ? (
          <div className="rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
            Carregando cadastros...
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
            Nenhum cadastro encontrado.
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => {
              const paymentDraft = paymentDrafts[lead.id] || {
                amount: "",
                monthRef: defaultMonthRef(),
                note: "",
              };

              return (
                <article
                  key={lead.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{lead.fullName}</h3>
                      <p className="text-sm text-slate-600">
                        {lead.whatsappE164} • Nasc.: {formatDate(lead.birthDate)}
                      </p>
                      <p className="text-sm text-slate-600">
                        Origem: {lead.originAirport} • Destinos: {lead.destinationAirport1},{" "}
                        {lead.destinationAirport2}, {lead.destinationAirport3}
                      </p>
                      <p className="text-xs text-slate-500">
                        Funcionário: {lead.employee.name} (@{lead.employee.login}) • Link:{" "}
                        {lead.link.code}
                      </p>
                      <p className="text-xs text-slate-500">
                        Adesão: {formatDateTime(lead.createdAt)}
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <div className="font-semibold text-slate-800">Status</div>
                      <div className="mt-1">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            lead.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-700"
                              : lead.status === "REJECTED"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {lead.status === "APPROVED"
                            ? "Aprovado"
                            : lead.status === "REJECTED"
                            ? "Rejeitado"
                            : "Pendente"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Aprovado em: {formatDateTime(lead.approvedAt)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => changeLeadStatus(lead.id, "APPROVED")}
                          disabled={savingLeadId === lead.id}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs hover:bg-emerald-100"
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          onClick={() => changeLeadStatus(lead.id, "REJECTED")}
                          disabled={savingLeadId === lead.id}
                          className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs hover:bg-rose-100"
                        >
                          Rejeitar
                        </button>
                        <button
                          type="button"
                          onClick={() => changeLeadStatus(lead.id, "PENDING")}
                          disabled={savingLeadId === lead.id}
                          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs hover:bg-amber-100"
                        >
                          Voltar p/ pendente
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <div className="font-semibold text-slate-800">Pagamentos</div>
                      <div className="mt-1 text-slate-700">
                        {lead.totals.paymentsCount} registro(s)
                      </div>
                      <div className="text-lg font-bold text-slate-900">
                        {formatMoney(lead.totals.totalPaidCents)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.3fr]">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">
                          Observação interna
                        </span>
                        <textarea
                          value={lead.internalNotes || ""}
                          onChange={(e) =>
                            setLeads((prev) =>
                              prev.map((item) =>
                                item.id === lead.id
                                  ? { ...item, internalNotes: e.target.value }
                                  : item
                              )
                            )
                          }
                          rows={3}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => saveLeadNote(lead.id, lead.internalNotes || "")}
                        disabled={savingLeadId === lead.id}
                        className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                      >
                        Salvar observação
                      </button>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-600">
                            Valor pago (R$)
                          </span>
                          <input
                            value={paymentDraft.amount}
                            onChange={(e) =>
                              updatePaymentDraft(lead.id, { amount: e.target.value })
                            }
                            placeholder="14,90"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-600">
                            Mês referência
                          </span>
                          <input
                            value={paymentDraft.monthRef}
                            onChange={(e) =>
                              updatePaymentDraft(lead.id, { monthRef: e.target.value })
                            }
                            placeholder="2026-02"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-600">
                            Observação
                          </span>
                          <input
                            value={paymentDraft.note}
                            onChange={(e) =>
                              updatePaymentDraft(lead.id, { note: e.target.value })
                            }
                            placeholder="PIX recebido"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => addPayment(lead.id)}
                        disabled={savingLeadId === lead.id}
                        className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Registrar pagamento
                      </button>

                      {lead.payments.length > 0 && (
                        <div className="mt-3 max-h-40 overflow-auto rounded-lg border border-slate-200">
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-2 py-1 text-left">Data</th>
                                <th className="px-2 py-1 text-left">Mês</th>
                                <th className="px-2 py-1 text-left">Valor</th>
                                <th className="px-2 py-1 text-left">Obs</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lead.payments.map((payment) => (
                                <tr key={payment.id} className="border-t border-slate-200">
                                  <td className="px-2 py-1">{formatDateTime(payment.paidAt)}</td>
                                  <td className="px-2 py-1">{payment.monthRef || "—"}</td>
                                  <td className="px-2 py-1">
                                    {formatMoney(payment.amountCents)}
                                  </td>
                                  <td className="px-2 py-1">{payment.note || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
