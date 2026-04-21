"use client";

import { useEffect, useMemo, useState } from "react";

type ReceberStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELED";
type ReceberCategoria = "EMPRESTIMO" | "CARTAO" | "PARCELAMENTO" | "SERVICO" | "OUTROS";
type ReceberMetodo = "PIX" | "CARTAO" | "BOLETO" | "DINHEIRO" | "TRANSFERENCIA" | "OUTRO";

type OwnerLite = { id: string; name: string; login: string };

type Payment = {
  id: string;
  dividaId: string;
  amountCents: number;
  method: ReceberMetodo;
  receivedAt: string;
  note: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  ownerId: string;
  owner?: OwnerLite;
  team: string;

  debtorName: string;
  debtorDoc: string | null;
  debtorPhone: string | null;
  debtorEmail: string | null;

  title: string;
  description: string | null;

  category: ReceberCategoria;
  method: ReceberMetodo;

  totalCents: number;
  receivedCents: number;

  dueDate: string | null;
  status: ReceberStatus;

  sourceLabel: string | null;

  payments: Payment[];

  createdAt: string;
  updatedAt: string;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
function fromCentsToInput(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Pill({ children, kind }: { children: any; kind: "open" | "partial" | "paid" | "canceled" }) {
  const cls =
    kind === "paid"
      ? "bg-green-50 text-green-700 border-green-200"
      : kind === "partial"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : kind === "canceled"
      ? "bg-neutral-100 text-neutral-600 border-neutral-200"
      : "bg-blue-50 text-blue-700 border-blue-200";

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

export default function DividasAReceberPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"" | ReceberStatus>("");
  const [q, setQ] = useState("");

  const [openCreate, setOpenCreate] = useState(false);

  // create form
  const [debtorName, setDebtorName] = useState("");
  const [title, setTitle] = useState("");
  const [totalInput, setTotalInput] = useState("0,00");
  const [dueDate, setDueDate] = useState<string>("");

  const [category, setCategory] = useState<ReceberCategoria>("OUTROS");
  const [method, setMethod] = useState<ReceberMetodo>("PIX");

  const [sourceLabel, setSourceLabel] = useState("");
  const [description, setDescription] = useState("");

  const totals = useMemo(() => {
    const totalCents = rows.reduce((a, r) => a + (r.totalCents || 0), 0);
    const receivedCents = rows.reduce((a, r) => a + (r.receivedCents || 0), 0);
    const balanceCents = rows.reduce((a, r) => a + Math.max(0, (r.totalCents || 0) - (r.receivedCents || 0)), 0);
    return { totalCents, receivedCents, balanceCents };
  }, [rows]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (q.trim()) qs.set("q", q.trim());
      qs.set("take", "200");

      const r = await fetch(`/api/dividas-a-receber?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar.");
      setRows(j.rows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    const totalCents = toCentsFromInput(totalInput);
    const payload = {
      debtorName,
      title,
      totalCents,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      category,
      method,
      sourceLabel: sourceLabel || null,
      description: description || null,
    };

    const r = await fetch("/api/dividas-a-receber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao criar.");
      return;
    }

    setOpenCreate(false);
    setDebtorName("");
    setTitle("");
    setTotalInput("0,00");
    setDueDate("");
    setCategory("OUTROS");
    setMethod("PIX");
    setSourceLabel("");
    setDescription("");
    load();
  }

  async function patch(id: string, data: any) {
    const r = await fetch(`/api/dividas-a-receber/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao salvar.");
      return;
    }
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir essa dívida a receber?")) return;
    const r = await fetch(`/api/dividas-a-receber/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao excluir.");
      return;
    }
    load();
  }

  // pagamento modal simples por linha
  const [payingForId, setPayingForId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("0,00");
  const [payMethod, setPayMethod] = useState<ReceberMetodo>("PIX");
  const [payDate, setPayDate] = useState<string>("");
  const [payNote, setPayNote] = useState("");

  async function addPayment() {
    if (!payingForId) return;
    const amountCents = toCentsFromInput(payAmount);
    const payload = {
      amountCents,
      method: payMethod,
      receivedAt: payDate ? new Date(payDate).toISOString() : null,
      note: payNote || null,
    };

    const r = await fetch(`/api/dividas-a-receber/${payingForId}/pagamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao lançar recebimento.");
      return;
    }

    setPayingForId(null);
    setPayAmount("0,00");
    setPayMethod("PIX");
    setPayDate("");
    setPayNote("");
    load();
  }

  async function deletePayment(paymentId: string) {
    if (!confirm("Remover esse recebimento?")) return;
    const r = await fetch(`/api/dividas-a-receber/pagamentos/${paymentId}`, { method: "DELETE" });
    const j = await r.json();
    if (!j?.ok) {
      alert(j?.error || "Erro ao remover recebimento.");
      return;
    }
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Dívidas a receber</div>
          <div className="text-sm text-neutral-600">
            Empréstimos, cartão a receber, parcelamentos etc. (não mistura com vendas).
          </div>
        </div>

        <button
          onClick={() => setOpenCreate(true)}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90"
        >
          + Nova dívida a receber
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Total a receber</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.totalCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Já recebido</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.receivedCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Saldo em aberto</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.balanceCents)}</div>
        </div>
      </div>

      {/* filtros */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <div className="flex gap-2 items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value || "") as any)}
            className="rounded-xl border px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos</option>
            <option value="OPEN">Em aberto</option>
            <option value="PARTIAL">Parcial</option>
            <option value="PAID">Quitado</option>
            <option value="CANCELED">Cancelado</option>
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (nome, doc, título, origem...)"
            className="rounded-xl border px-3 py-2 text-sm w-72"
          />

          <button
            onClick={load}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Filtrar
          </button>
        </div>

        {loading ? <div className="text-sm text-neutral-500">Carregando…</div> : null}
      </div>

      {/* tabela */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr className="text-left">
                <th className="p-3">Status</th>
                <th className="p-3">Devedor</th>
                <th className="p-3">Título</th>
                <th className="p-3">Venc.</th>
                <th className="p-3">Total</th>
                <th className="p-3">Recebido</th>
                <th className="p-3">Saldo</th>
                <th className="p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-6 text-neutral-500" colSpan={8}>
                    Nenhum registro.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const saldo = Math.max(0, (r.totalCents || 0) - (r.receivedCents || 0));
                  const kind =
                    r.status === "PAID" ? "paid" : r.status === "PARTIAL" ? "partial" : r.status === "CANCELED" ? "canceled" : "open";

                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">
                        <Pill kind={kind}>
                          {r.status === "OPEN"
                            ? "Em aberto"
                            : r.status === "PARTIAL"
                            ? "Parcial"
                            : r.status === "PAID"
                            ? "Quitado"
                            : "Cancelado"}
                        </Pill>
                      </td>

                      <td className="p-3">
                        <div className="font-medium">{r.debtorName}</div>
                        <div className="text-xs text-neutral-500">
                          {r.debtorDoc ? `Doc: ${r.debtorDoc}` : ""}
                          {r.sourceLabel ? ` • Origem: ${r.sourceLabel}` : ""}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-neutral-500">
                          {r.category} • {r.method}
                        </div>
                      </td>

                      <td className="p-3">{fmtDateBR(r.dueDate)}</td>

                      <td className="p-3">{fmtMoneyBR(r.totalCents)}</td>
                      <td className="p-3">{fmtMoneyBR(r.receivedCents)}</td>
                      <td className="p-3 font-medium">{fmtMoneyBR(saldo)}</td>

                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              setPayingForId(r.id);
                              setPayAmount("0,00");
                              setPayMethod("PIX");
                              setPayDate("");
                              setPayNote("");
                            }}
                            className="rounded-lg border px-3 py-1 text-xs hover:bg-neutral-50"
                          >
                            + Recebimento
                          </button>

                          {r.status !== "CANCELED" ? (
                            <button
                              onClick={() => patch(r.id, { status: "CANCELED" })}
                              className="rounded-lg border px-3 py-1 text-xs hover:bg-neutral-50"
                            >
                              Cancelar
                            </button>
                          ) : (
                            <button
                              onClick={() => patch(r.id, { status: "OPEN" })}
                              className="rounded-lg border px-3 py-1 text-xs hover:bg-neutral-50"
                            >
                              Reativar
                            </button>
                          )}

                          <button
                            onClick={() => remove(r.id)}
                            className="rounded-lg border px-3 py-1 text-xs hover:bg-neutral-50 text-red-600"
                          >
                            Excluir
                          </button>
                        </div>

                        {/* histórico */}
                        {r.payments?.length ? (
                          <div className="mt-2 space-y-1">
                            {r.payments.slice(0, 3).map((p) => (
                              <div key={p.id} className="text-xs text-neutral-600 flex items-center justify-between gap-2">
                                <div>
                                  <span className="font-medium">{fmtMoneyBR(p.amountCents)}</span>
                                  <span className="text-neutral-400"> • {fmtDateBR(p.receivedAt)} • {p.method}</span>
                                  {p.note ? <span className="text-neutral-400"> • {p.note}</span> : null}
                                </div>
                                <button
                                  onClick={() => deletePayment(p.id)}
                                  className="text-red-600 hover:underline"
                                >
                                  remover
                                </button>
                              </div>
                            ))}
                            {r.payments.length > 3 ? (
                              <div className="text-xs text-neutral-400">… +{r.payments.length - 3} recebimentos</div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREATE */}
      {openCreate ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Nova dívida a receber</div>
              <button onClick={() => setOpenCreate(false)} className="text-sm text-neutral-600 hover:underline">
                fechar
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500">Quem te deve</label>
                <input value={debtorName} onChange={(e) => setDebtorName(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs text-neutral-500">Título</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs text-neutral-500">Total (R$)</label>
                <input value={totalInput} onChange={(e) => setTotalInput(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs text-neutral-500">Vencimento</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white" />
              </div>

              <div>
                <label className="text-xs text-neutral-500">Categoria</label>
                <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white">
                  <option value="EMPRESTIMO">Empréstimo</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="PARCELAMENTO">Parcelamento</option>
                  <option value="SERVICO">Serviço</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-neutral-500">Método esperado</label>
                <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white">
                  <option value="PIX">PIX</option>
                  <option value="TRANSFERENCIA">Transferência</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-neutral-500">Origem (opcional)</label>
                <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Ex: Nubank, Inter, fulano, etc." />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-neutral-500">Descrição (opcional)</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm min-h-[90px]" />
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2">
              <button onClick={() => setOpenCreate(false)} className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50">
                Cancelar
              </button>
              <button onClick={create} className="rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90">
                Criar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL PAGAMENTO */}
      {payingForId ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Lançar recebimento</div>
              <button onClick={() => setPayingForId(null)} className="text-sm text-neutral-600 hover:underline">
                fechar
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500">Valor (R$)</label>
                <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs text-neutral-500">Método</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white">
                  <option value="PIX">PIX</option>
                  <option value="TRANSFERENCIA">Transferência</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-neutral-500">Data</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white" />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-neutral-500">Observação</label>
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2">
              <button onClick={() => setPayingForId(null)} className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50">
                Cancelar
              </button>
              <button onClick={addPayment} className="rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90">
                Lançar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
