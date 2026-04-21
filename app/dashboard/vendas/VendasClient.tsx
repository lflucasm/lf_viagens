"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}

// ✅ evita “voltar 1 dia” quando vier ISO em UTC
function fmtDateBR(v: string) {
  if (!v) return "—";
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mm = Number(m[2]);
    const d = Number(m[3]);
    return new Date(y, mm - 1, d).toLocaleDateString("pt-BR");
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR");
}

function fmtDateTimeBR(v: string) {
  if (!v) return "—";
  const dt = new Date(String(v));
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("pt-BR");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as any)?.ok === false)
    throw new Error((j as any)?.error || `Erro ${r.status}`);
  return j as T;
}

type SaleRow = {
  id: string;
  numero: string;
  date: string;

  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  points: number;
  milheiroCents: number;
  passengers: number;

  totalCents: number;
  paymentStatus: "PENDING" | "PAID" | "CANCELED";
  locator: string | null;

  // ✅ vem da API (aparece só no modal)
  feeCardLabel?: string | null;
  embarqueFeeCents?: number | null;

  cliente: { id: string; identificador: string; nome: string };

  cedente?: { id: string; identificador: string; nomeCompleto: string } | null;

  receivable?: {
    id: string;
    totalCents: number;
    receivedCents: number;
    balanceCents: number;
    status: "OPEN" | "RECEIVED" | "CANCELED";
  } | null;

  createdAt: string;
};

type StatusFilter = "ALL" | "PENDING" | "PAID" | "CANCELED";

function pendingCentsOfSale(r: SaleRow) {
  if (r.paymentStatus === "PAID") return 0;
  if (r.paymentStatus === "CANCELED") return 0;

  if (typeof r.receivable?.balanceCents === "number")
    return Math.max(0, r.receivable.balanceCents);
  return Math.max(0, r.totalCents || 0);
}

function feeCentsOfSale(r: SaleRow) {
  const v = r.embarqueFeeCents;
  return typeof v === "number" ? Math.max(0, v) : null;
}

export default function VendasClient() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [q, setQ] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // ✅ filtros
  const [clientId, setClientId] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("PENDING");

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ✅ modal de detalhes
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const details = useMemo(
    () => (detailsId ? rows.find((r) => r.id === detailsId) || null : null),
    [rows, detailsId]
  );

  async function load(opts?: { append?: boolean }) {
    const append = Boolean(opts?.append);
    if (append && !nextCursor) return;

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const qs = new URLSearchParams();
      if (append && nextCursor) qs.set("cursor", nextCursor);
      qs.set("limit", "200");
      if (q.trim()) qs.set("q", q.trim());
      if (clientId !== "ALL") qs.set("clientId", clientId);
      if (status !== "ALL") qs.set("status", status);

      const out = await api<{
        ok: true;
        sales: SaleRow[];
        nextCursor?: string | null;
      }>(`/api/vendas?${qs.toString()}`);

      const list = out.sales || [];

      if (append) setRows((prev) => [...prev, ...list]);
      else setRows(list);

      setNextCursor(out.nextCursor || null);
    } catch {
      if (!append) {
        setRows([]);
        setNextCursor(null);
      }
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  // ✅ busca no servidor (inclusive localizador) com debounce
  useEffect(() => {
    const delay = q.trim() ? 300 : 0;
    const t = setTimeout(() => {
      load();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, clientId, status]);

  const clients = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; identificador: string }>();
    for (const r of rows) {
      if (r?.cliente?.id && !map.has(r.cliente.id)) {
        map.set(r.cliente.id, {
          id: r.cliente.id,
          nome: r.cliente.nome || "—",
          identificador: r.cliente.identificador || "—",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR")
    );
  }, [rows]);

  const selectedClient = useMemo(() => {
    if (!clientId || clientId === "ALL") return null;
    return clients.find((c) => c.id === clientId) || null;
  }, [clients, clientId]);

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();

    return rows.filter((r) => {
      // 1) filtro cliente
      if (clientId !== "ALL" && r.cliente?.id !== clientId) return false;

      // 2) filtro status
      if (status !== "ALL" && r.paymentStatus !== status) return false;

      // 3) busca livre
      if (!s) return true;

      const ced = (r.cedente?.nomeCompleto || "").toLowerCase();
      const cedId = (r.cedente?.identificador || "").toLowerCase();
      const cliente = (r.cliente?.nome || "").toLowerCase();
      const num = (r.numero || "").toLowerCase();
      const loc = (r.locator || "").toLowerCase();
      const card = (r.feeCardLabel || "").toLowerCase();

      return (
        num.includes(s) ||
        cliente.includes(s) ||
        loc.includes(s) ||
        ced.includes(s) ||
        cedId.includes(s) ||
        card.includes(s)
      );
    });
  }, [rows, q, clientId, status]);

  const totals = useMemo(() => {
    let totalGeral = 0;
    let totalPend = 0;
    let totalPago = 0;

    for (const r of filtered) {
      totalGeral += r.totalCents || 0;

      const pend = pendingCentsOfSale(r);
      totalPend += pend;

      if (r.paymentStatus === "PAID") totalPago += r.totalCents || 0;
    }
    return { totalGeral, totalPend, totalPago, count: filtered.length };
  }, [filtered]);

  async function togglePago(r: SaleRow) {
    if (updatingId) return;
    if (r.paymentStatus === "CANCELED") return;

    const next: "PENDING" | "PAID" = r.paymentStatus === "PAID" ? "PENDING" : "PAID";

    setUpdatingId(r.id);
    try {
      await api<{ ok: true }>("/api/vendas/status", {
        method: "PATCH",
        // ✅ mando os dois nomes (status e paymentStatus) pra ser compatível
        body: JSON.stringify({ saleId: r.id, status: next, paymentStatus: next }),
      });

      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                paymentStatus: next,
                receivable: x.receivable
                  ? {
                      ...x.receivable,
                      status: next === "PAID" ? "RECEIVED" : "OPEN",
                      receivedCents: next === "PAID" ? x.totalCents : 0,
                      balanceCents: next === "PAID" ? 0 : x.totalCents,
                    }
                  : x.receivable,
              }
            : x
        )
      );
    } catch (e: any) {
      alert(e?.message || "Falha ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  }

  /**
   * ✅ Cancelar venda:
   * - sempre estorna pontos
   * - pergunta se mantém passageiros "queimados" (padrão) ou reseta (erro de cadastro)
   */
  async function cancelSale(r: SaleRow) {
    if (updatingId) return;
    if (r.paymentStatus === "CANCELED") return;

    const ok1 = confirm(
      `Cancelar a venda ${r.numero}?\n\n• Os pontos serão estornados para o cedente.\n• O recebível (se existir) será cancelado.`
    );
    if (!ok1) return;

    // ✅ padrão: manter passageiros usados (CPF queimado)
    const keepPassengers = confirm(
      "Manter o uso dos passageiros?\n\n✅ OK = MANTER (padrão). A cota NÃO volta (CPF queimado).\n❌ Cancelar = RESETAR. Use só se foi erro de cadastro e quer devolver a cota."
    );

    setUpdatingId(r.id);
    try {
      await api<{ ok: true }>("/api/vendas/cancelar", {
        method: "POST",
        body: JSON.stringify({ saleId: r.id, keepPassengers }),
      });

      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                paymentStatus: "CANCELED",
                receivable: x.receivable
                  ? {
                      ...x.receivable,
                      status: "CANCELED",
                      receivedCents: 0,
                      balanceCents: 0,
                    }
                  : x.receivable,
              }
            : x
        )
      );
    } catch (e: any) {
      alert(e?.message || "Falha ao cancelar venda.");
    } finally {
      setUpdatingId(null);
    }
  }

  function statusBadge(r: SaleRow) {
    return r.paymentStatus === "PAID"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : r.paymentStatus === "CANCELED"
      ? "bg-slate-100 border-slate-200 text-slate-600"
      : "bg-amber-50 border-amber-200 text-amber-700";
  }

  function statusLabel(r: SaleRow) {
    return r.paymentStatus === "PAID"
      ? "Pago"
      : r.paymentStatus === "CANCELED"
      ? "Cancelado"
      : "Pendente";
  }

  function chip(active: boolean) {
    return cn(
      "rounded-full border px-3 py-1.5 text-xs",
      active ? "bg-black text-white border-black" : "bg-white text-slate-700 hover:bg-slate-50"
    );
  }

  const headerSuffix = selectedClient ? ` • ${selectedClient.nome}` : "";

  // ✅ fechar modal com ESC
  useEffect(() => {
    if (!detailsId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailsId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsId]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendas{headerSuffix}</h1>
          <p className="text-sm text-slate-500">
            Filtre por cliente e status para ver pendências e pagamentos.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => load()}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm",
              loading ? "opacity-60" : "hover:bg-slate-50"
            )}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <Link
            href="/dashboard/vendas/nova"
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            + Nova venda
          </Link>
        </div>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* cliente */}
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">Cliente</div>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm min-w-[320px] bg-white"
          >
            <option value="ALL">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({c.identificador})
              </option>
            ))}
          </select>
        </div>

        {/* status */}
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">Status</div>
          <button className={chip(status === "ALL")} onClick={() => setStatus("ALL")}>
            Todos
          </button>
          <button className={chip(status === "PENDING")} onClick={() => setStatus("PENDING")}>
            Pendentes
          </button>
          <button className={chip(status === "PAID")} onClick={() => setStatus("PAID")}>
            Pagos
          </button>
          <button className={chip(status === "CANCELED")} onClick={() => setStatus("CANCELED")}>
            Cancelados
          </button>
        </div>

        {/* busca */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por cliente / número / localizador / cedente / cartão..."
          className="border rounded-xl px-3 py-2 text-sm w-[520px]"
        />

        {(clientId !== "ALL" || status !== "PENDING" || q.trim()) && (
          <button
            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
            onClick={() => {
              setClientId("ALL");
              setStatus("PENDING");
              setQ("");
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* resumo */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">Vendas (filtro)</div>
          <div className="text-lg font-semibold">{fmtInt(totals.count)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">
            {selectedClient ? "Total no filtro (cliente)" : "Total no filtro"}
          </div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.totalGeral)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">
            {selectedClient ? "Total pendente a receber (cliente)" : "Total pendente a receber"}
          </div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.totalPend)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-500">
            {selectedClient ? "Total pago (cliente)" : "Total pago"}
          </div>
          <div className="text-lg font-semibold">{fmtMoneyBR(totals.totalPago)}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[120px]">DATA</th>
                <th className="text-left font-semibold px-4 py-3 w-[130px]">VENDA</th>
                <th className="text-left font-semibold px-4 py-3 w-[260px]">CLIENTE</th>
                <th className="text-left font-semibold px-4 py-3 w-[280px]">CEDENTE</th>
                <th className="text-left font-semibold px-4 py-3 w-[120px]">PROGRAMA</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">PONTOS</th>
                <th className="text-right font-semibold px-4 py-3 w-[130px]">MILHEIRO</th>
                <th className="text-right font-semibold px-4 py-3 w-[100px]">PAX</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">TOTAL</th>
                <th className="text-right font-semibold px-4 py-3 w-[170px]">A RECEBER</th>
                <th className="text-left font-semibold px-4 py-3 w-[140px]">STATUS</th>
                <th className="text-left font-semibold px-4 py-3 w-[140px]">LOC</th>
                <th className="text-right font-semibold px-4 py-3 w-[200px]">AÇÃO</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-slate-500">
                    Nenhum resultado.
                  </td>
                </tr>
              ) : null}

              {filtered.map((r) => {
                const pend = pendingCentsOfSale(r);
                const isBusy = updatingId === r.id;

                return (
                  <tr
                    key={r.id}
                    className="border-b last:border-b-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setDetailsId(r.id)}
                    title="Clique para ver detalhes"
                  >
                    <td className="px-4 py-3">{fmtDateBR(r.date)}</td>

                    <td className="px-4 py-3 font-mono">
                      <button
                        className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailsId(r.id);
                        }}
                      >
                        {r.numero}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.cliente.nome}</div>
                      <div className="text-xs text-slate-500">{r.cliente.identificador}</div>
                    </td>

                    <td className="px-4 py-3">
                      {r.cedente?.nomeCompleto ? (
                        <>
                          <div className="font-medium">{r.cedente.nomeCompleto}</div>
                          <div className="text-xs text-slate-500">{r.cedente.identificador}</div>
                        </>
                      ) : (
                        <div className="text-slate-400">—</div>
                      )}
                    </td>

                    <td className="px-4 py-3">{r.program}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.points)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtMoneyBR(r.milheiroCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.passengers)}</td>

                    <td className="px-4 py-3 text-right font-semibold">{fmtMoneyBR(r.totalCents)}</td>

                    <td
                      className={cn(
                        "px-4 py-3 text-right font-semibold",
                        pend > 0 ? "text-amber-700" : "text-slate-700"
                      )}
                    >
                      {fmtMoneyBR(pend)}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={cn("inline-flex rounded-full border px-2 py-1 text-xs", statusBadge(r))}
                      >
                        {statusLabel(r)}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono text-xs">{r.locator || "—"}</td>

                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()} // ✅ não abrir detalhes ao clicar nos botões
                    >
                      {r.paymentStatus === "CANCELED" ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => togglePago(r)}
                            disabled={isBusy}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm",
                              isBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                            )}
                            title={r.paymentStatus === "PAID" ? "Marcar como pendente" : "Marcar como pago"}
                          >
                            {isBusy
                              ? "Salvando..."
                              : r.paymentStatus === "PAID"
                              ? "Marcar pendente"
                              : "Marcar pago"}
                          </button>

                          <button
                            onClick={() => cancelSale(r)}
                            disabled={isBusy}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm border-red-300 text-red-700",
                              isBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-red-50"
                            )}
                            title="Cancelar venda (estorna pontos e opcionalmente reseta passageiros)"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-3 text-xs text-slate-500">
          “A receber” = Receivable.balanceCents (se existir) senão usa Total quando status for Pendente.
        </div>
      </div>

      <div className="flex justify-center">
        {nextCursor ? (
          <button
            onClick={() => load({ append: true })}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm",
              loadingMore ? "opacity-60" : "hover:bg-slate-50"
            )}
            disabled={loadingMore}
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        ) : (
          <div className="text-xs text-slate-500">Fim do histórico.</div>
        )}
      </div>

      {/* ✅ MODAL DETALHES */}
      {details ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setDetailsId(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <div className="text-xs text-slate-500">Detalhes da venda</div>
                <div className="text-lg font-semibold">
                  {details.numero} • {fmtDateBR(details.date)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Criada em {fmtDateTimeBR(details.createdAt)}
                </div>
              </div>

              <button
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => setDetailsId(null)}
              >
                Fechar
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="mt-1">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-1 text-xs",
                        statusBadge(details)
                      )}
                    >
                      {statusLabel(details)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Programa</div>
                  <div className="mt-1 font-semibold">{details.program}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {fmtInt(details.points)} pts • {fmtInt(details.passengers)} pax
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Milheiro: <span className="font-semibold">{fmtMoneyBR(details.milheiroCents)}</span>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Localizador</div>
                  <div className="mt-1 font-mono text-sm">{details.locator || "—"}</div>
                </div>
              </div>

              {/* ✅ cartão + taxa (SÓ no modal) */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Cartão usado</div>
                  <div className="mt-1 text-sm text-slate-800">
                    {details.feeCardLabel ? (
                      <span className="font-medium">{details.feeCardLabel}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Taxa de embarque</div>
                  <div className="mt-1 text-lg font-semibold">
                    {feeCentsOfSale(details) === null
                      ? "—"
                      : fmtMoneyBR(feeCentsOfSale(details) || 0)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Cliente</div>
                  <div className="mt-1 font-semibold">{details.cliente.nome}</div>
                  <div className="text-xs text-slate-500">{details.cliente.identificador}</div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Cedente</div>
                  {details.cedente?.nomeCompleto ? (
                    <>
                      <div className="mt-1 font-semibold">{details.cedente.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">{details.cedente.identificador}</div>
                    </>
                  ) : (
                    <div className="mt-1 text-slate-400">—</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-500">Total</div>
                    <div className="text-lg font-semibold">{fmtMoneyBR(details.totalCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">A receber</div>
                    <div
                      className={cn(
                        "text-lg font-semibold",
                        pendingCentsOfSale(details) > 0 ? "text-amber-700" : "text-slate-800"
                      )}
                    >
                      {fmtMoneyBR(pendingCentsOfSale(details))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Recebível</div>
                    {details.receivable ? (
                      <div className="text-sm mt-1 text-slate-700">
                        <div>
                          ID: <span className="font-mono">{details.receivable.id}</span>
                        </div>
                        <div>
                          Status: <span className="font-semibold">{details.receivable.status}</span>
                        </div>
                        <div>
                          Total:{" "}
                          <span className="font-semibold">
                            {fmtMoneyBR(details.receivable.totalCents)}
                          </span>
                        </div>
                        <div>
                          Recebido:{" "}
                          <span className="font-semibold">
                            {fmtMoneyBR(details.receivable.receivedCents)}
                          </span>
                        </div>
                        <div>
                          Saldo:{" "}
                          <span className="font-semibold">
                            {fmtMoneyBR(details.receivable.balanceCents)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-slate-400">—</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
                {details.paymentStatus !== "CANCELED" ? (
                  <>
                    <button
                      onClick={() => togglePago(details)}
                      disabled={updatingId === details.id}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-sm",
                        updatingId === details.id ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                      )}
                    >
                      {updatingId === details.id
                        ? "Salvando..."
                        : details.paymentStatus === "PAID"
                        ? "Marcar pendente"
                        : "Marcar pago"}
                    </button>

                    <button
                      onClick={() => cancelSale(details)}
                      disabled={updatingId === details.id}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-sm border-red-300 text-red-700",
                        updatingId === details.id ? "opacity-60 cursor-not-allowed" : "hover:bg-red-50"
                      )}
                    >
                      Cancelar venda
                    </button>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Venda cancelada.</div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Dica: aperta <span className="font-mono">ESC</span> pra fechar.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
