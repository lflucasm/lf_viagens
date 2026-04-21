"use client";

import { useEffect, useMemo, useState } from "react";

type Receipt = {
  id: string;
  amountCents: number;
  note?: string | null;
  receivedAt: string;
};

type Receivable = {
  id: string;
  title: string;
  description?: string | null;
  totalCents: number;
  receivedCents: number;
  balanceCents: number;
  status: "OPEN" | "RECEIVED" | "CANCELED";
  createdAt: string;
  receipts: Receipt[];
};

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateTimeBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}

function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function RecebimentosClient() {
  const [loading, setLoading] = useState(false);
  const [receivables, setReceivables] = useState<Receivable[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");

  const [rcvAmount, setRcvAmount] = useState<Record<string, string>>({});
  const [rcvNote, setRcvNote] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/recebimentos", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar recebimentos");
      setReceivables(j.data || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const totalCents = receivables.reduce((a, d) => a + (d.totalCents || 0), 0);
    const receivedCents = receivables.reduce((a, d) => a + (d.receivedCents || 0), 0);
    const balanceCents = receivables.reduce((a, d) => a + (d.balanceCents || 0), 0);
    return { totalCents, receivedCents, balanceCents };
  }, [receivables]);

  async function createReceivable() {
    const cents = toCentsFromInput(total);
    if (!title.trim()) return alert("Informe a descrição/título.");
    if (cents <= 0) return alert("Valor inválido.");

    setLoading(true);
    try {
      const r = await fetch("/api/recebimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, total }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao criar recebimento");
      setTitle("");
      setDescription("");
      setTotal("");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addReceipt(receivableId: string) {
    const amount = rcvAmount[receivableId] || "";
    const note = rcvNote[receivableId] || "";
    const cents = toCentsFromInput(amount);
    if (cents <= 0) return alert("Recebimento inválido.");

    setLoading(true);
    try {
      const r = await fetch(`/api/recebimentos/${receivableId}/receitas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao registrar recebimento");

      setRcvAmount((prev) => ({ ...prev, [receivableId]: "" }));
      setRcvNote((prev) => ({ ...prev, [receivableId]: "" }));
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Recebimentos</h1>
          <p className="text-sm text-slate-600">
            Cadastre valores a receber e vá registrando os recebimentos com data/hora.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Total a receber</div>
          <div className="text-xl font-bold">{fmtMoney(totals.totalCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Total recebido</div>
          <div className="text-xl font-bold">{fmtMoney(totals.receivedCents)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Saldo (aberto)</div>
          <div className="text-xl font-bold">{fmtMoney(totals.balanceCents)}</div>
        </div>
      </div>

      {/* Criar recebível */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Adicionar recebimento (a receber)</div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs text-slate-600">Descrição (título)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Cliente X / Venda Y / Reembolso..."
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-600">Valor total (R$)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="Ex: 1500,00"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-600">Detalhes (opcional)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: parcela 2/5, canal, observações..."
            />
          </div>
        </div>

        <button
          onClick={createReceivable}
          className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
          disabled={loading}
        >
          Adicionar
        </button>
      </div>

      {/* Lista */}
      {receivables.length === 0 ? (
        <div className="text-sm text-slate-600">Nenhum recebimento cadastrado ainda.</div>
      ) : (
        <div className="space-y-4">
          {receivables.map((d) => (
            <div key={d.id} className="rounded-2xl border bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">
                    {d.title}{" "}
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${
                        d.status === "RECEIVED" ? "bg-emerald-50" : "bg-yellow-50"
                      }`}
                    >
                      {d.status === "RECEIVED" ? "Recebido" : "Aberto"}
                    </span>
                  </div>

                  {d.description ? <div className="text-sm text-slate-600">{d.description}</div> : null}
                  <div className="text-xs text-slate-500">Criado em {dateTimeBR(d.createdAt)}</div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-600">Total</div>
                  <div className="font-semibold">{fmtMoney(d.totalCents)}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-600">Recebido</div>
                  <div className="text-sm font-semibold">{fmtMoney(d.receivedCents)}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-600">Saldo</div>
                  <div className="text-sm font-semibold">{fmtMoney(d.balanceCents)}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-slate-600">Entradas</div>
                  <div className="text-sm font-semibold">{d.receipts.length}</div>
                </div>
              </div>

              {/* Add receipt */}
              {d.status !== "RECEIVED" && (
                <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
                  <div className="text-sm font-semibold">Registrar recebimento</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      className="rounded-xl border px-3 py-2 text-sm"
                      placeholder="Valor (ex: 200,00)"
                      value={rcvAmount[d.id] ?? ""}
                      onChange={(e) => setRcvAmount((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    />
                    <input
                      className="rounded-xl border px-3 py-2 text-sm"
                      placeholder="Obs (opcional)"
                      value={rcvNote[d.id] ?? ""}
                      onChange={(e) => setRcvNote((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => addReceipt(d.id)}
                      className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
                      disabled={loading}
                    >
                      Registrar
                    </button>
                  </div>
                  <div className="text-xs text-slate-600">* grava automaticamente data e hora do registro.</div>
                </div>
              )}

              {/* History */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Histórico</div>
                {d.receipts.length === 0 ? (
                  <div className="text-sm text-slate-600">Nenhum recebimento registrado.</div>
                ) : (
                  <div className="max-h-56 overflow-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Data/hora</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                          <th className="px-3 py-2 text-left">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.receipts.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="px-3 py-2">{dateTimeBR(p.receivedAt)}</td>
                            <td className="px-3 py-2 text-right">{fmtMoney(p.amountCents)}</td>
                            <td className="px-3 py-2">{p.note || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
