"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type SettlementStatus = "AWAITING_CONSOLIDATOR_PAYMENT" | "RELEASED";

type Row = {
  id: string;
  consolidatorName: string;
  clientName: string;
  totalCents: number;
  commissionCents: number;
  commissionBps: number | null;
  status: SettlementStatus;
  releasedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; login: string };
  releasedBy: { id: string; name: string; login: string } | null;
};

function formatMoneyBR(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDateTimeBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function parseMoneyToCents(raw: string) {
  const s = raw.trim();
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function bpsToPercentLabel(bps: number | null) {
  if (bps == null) return "—";
  return `${(bps / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function statusLabel(s: SettlementStatus) {
  return s === "RELEASED" ? "Liberado" : "Aguardando consolidadora";
}

function statusClass(s: SettlementStatus) {
  if (s === "RELEASED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export default function ConsolidadoraClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [consolidatorName, setConsolidatorName] = useState("");
  const [clientName, setClientName] = useState("");
  const [totalStr, setTotalStr] = useState("");
  const [commissionStr, setCommissionStr] = useState("");
  const [notes, setNotes] = useState("");

  const [filter, setFilter] = useState<"" | SettlementStatus>("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/consolidator-sales", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar registros.");
      }
      setRows((json.data?.rows || []) as Row[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const previewTotalCents = useMemo(() => parseMoneyToCents(totalStr), [totalStr]);
  const previewCommissionCents = useMemo(
    () => parseMoneyToCents(commissionStr),
    [commissionStr]
  );
  const previewBps =
    previewTotalCents > 0
      ? Math.round((previewCommissionCents * 10000) / previewTotalCents)
      : null;

  const filtered = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/consolidator-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consolidatorName,
          clientName,
          total: totalStr,
          commission: commissionStr,
          notes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Não foi possível salvar.");
      }
      const row = json.data?.row as Row;
      if (row) setRows((prev) => [row, ...prev]);
      setConsolidatorName("");
      setClientName("");
      setTotalStr("");
      setCommissionStr("");
      setNotes("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function release(id: string) {
    if (!confirm("Marcar como liberado após pagamento da consolidadora?")) return;
    setReleasingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/consolidator-sales/${encodeURIComponent(id)}/release`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Não foi possível liberar.");
      }
      const row = json.data?.row as Row;
      if (row) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      } else {
        await load();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao liberar.");
    } finally {
      setReleasingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-black text-slate-900">Consolidadora</h1>
        <p className="text-sm text-slate-600">
          Registros de venda pela consolidadora, com comissão e percentual automático. Libere quando
          a consolidadora pagar — não entra na aba de funcionários.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
      >
        <h2 className="text-sm font-semibold text-slate-800">Novo registro</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Consolidadora</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
              value={consolidatorName}
              onChange={(e) => setConsolidatorName(e.target.value)}
              placeholder="Nome da consolidadora"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Cliente (para quem vendeu)</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Cliente final"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Valor total (R$)</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
              value={totalStr}
              onChange={(e) => setTotalStr(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Comissão (R$)</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
              value={commissionStr}
              onChange={(e) => setCommissionStr(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-600">Percentual da comissão:</span>
          <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-800 tabular-nums">
            {bpsToPercentLabel(previewBps)}
          </span>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Observações (opcional)</span>
          <textarea
            className="w-full min-h-[72px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas internas"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Histórico</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">
              Filtrar:{" "}
              <select
                className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value as "" | SettlementStatus)}
              >
                <option value="">Todos</option>
                <option value="AWAITING_CONSOLIDATOR_PAYMENT">Aguardando consolidadora</option>
                <option value="RELEASED">Liberado</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => load()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Consolidadora</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Comissão</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Cadastro</th>
                <th className="px-3 py-2 w-32" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Nenhum registro.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {fmtDateTimeBR(r.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{r.consolidatorName}</td>
                    <td className="px-3 py-2 text-slate-800">{r.clientName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {formatMoneyBR(r.totalCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {formatMoneyBR(r.commissionCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {bpsToPercentLabel(r.commissionBps)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium",
                          statusClass(r.status)
                        )}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.createdBy.name}
                      {r.releasedBy && r.status === "RELEASED" && (
                        <div className="mt-0.5 text-emerald-700">
                          Lib.: {r.releasedBy.name} · {fmtDateTimeBR(r.releasedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.status === "AWAITING_CONSOLIDATOR_PAYMENT" ? (
                        <button
                          type="button"
                          onClick={() => release(r.id)}
                          disabled={releasingId === r.id}
                          className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {releasingId === r.id ? "…" : "Liberar"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
