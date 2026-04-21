"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PurchaseStatus = "OPEN" | "DRAFT" | "READY" | "CLOSED" | "CANCELED";
type LoyaltyProgram = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type PurchaseRowRaw = {
  id: string;
  numero: string;
  status: PurchaseStatus;
  createdAt: string;

  ciaProgram?: LoyaltyProgram | null;
  ciaAerea?: LoyaltyProgram | null;

  ciaPointsTotal?: number;
  pontosCiaTotal?: number;

  totalCostCents?: number;
  totalCost?: number;
  totalCents?: number;

  cedente?: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;
};

type PurchaseRow = {
  id: string;
  numero: string;
  status: PurchaseStatus;
  createdAt: string;

  ciaProgram: LoyaltyProgram | null;
  ciaPointsTotal: number;

  totalCostCents: number;

  cedente: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;
};

function asInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeRow(r: PurchaseRowRaw): PurchaseRow {
  return {
    id: r.id,
    numero: r.numero,
    status: r.status,
    createdAt: r.createdAt,

    ciaProgram: (r.ciaProgram ?? r.ciaAerea ?? null) as any,
    ciaPointsTotal: asInt((r.ciaPointsTotal ?? r.pontosCiaTotal ?? 0) as any),

    totalCostCents: asInt((r.totalCostCents ?? r.totalCost ?? r.totalCents ?? 0) as any),

    cedente: r.cedente ?? null,
  };
}

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

/**
 * Retorna custo por 1.000 pts (em CENTAVOS).
 * Ex: totalCostCents=378245 e points=140000 => ~2702 cents => R$ 27,02 / mil
 */
function milheiroCents(points: number, totalCostCents: number) {
  const p = asInt(points, 0);
  const c = asInt(totalCostCents, 0);
  if (p <= 0 || c <= 0) return 0;
  return Math.round((c * 1000) / p);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.ok === false) {
    console.error("API FAIL:", url, res.status, data);
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data as T;
}

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  OPEN: "Aberta",
  DRAFT: "Rascunho",
  READY: "Pronta",
  CLOSED: "Liberada",
  CANCELED: "Cancelada",
};

function StatusPill({ status }: { status: PurchaseStatus }) {
  const cls =
    status === "CLOSED"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : status === "CANCELED"
      ? "bg-red-50 border-red-200 text-red-700"
      : status === "READY"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-gray-50 border-gray-200 text-gray-700";

  return <span className={`rounded-full border px-2 py-1 text-xs ${cls}`}>{STATUS_LABEL[status]}</span>;
}

function norm(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

type PointsBuyRow = {
  id?: string;
  title: string;
  pointsFinal: number;
  amountCents: number;
  remove?: boolean;
};

export default function ComprasClient() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | PurchaseStatus>("");

  const [busyId, setBusyId] = useState<string | null>(null);

  // modal state
  const [pointsModalId, setPointsModalId] = useState<string | null>(null);

  // paginação
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  function resetPagination() {
    setNextCursor(null);
    setHasMore(false);
  }

  async function load(opts?: { silent?: boolean; append?: boolean }) {
    const append = !!opts?.append;

    if (!opts?.silent) {
      if (append) setLoadingMore(true);
      else setLoading(true);
    }

    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());

      // paginação
      qs.set("take", "50");
      if (append && nextCursor) qs.set("cursor", nextCursor);

      const out = await api<{
        ok: true;
        compras: PurchaseRowRaw[];
        nextCursor?: string | null;
      }>(`/api/compras?${qs.toString()}`);

      const list = Array.isArray(out.compras) ? out.compras : [];
      const mapped = list.map(normalizeRow);

      setRows((prev) => (append ? [...prev, ...mapped] : mapped));

      const nc = out.nextCursor ?? null;
      setNextCursor(nc);
      setHasMore(!!nc);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar compras.");
      if (!append) setRows([]);
    } finally {
      if (!opts?.silent) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }

  useEffect(() => {
    resetPagination();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = norm(q);
    const dig = onlyDigits(q);

    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (!needle && !dig) return true;

      const ced = r.cedente;
      const m = milheiroCents(r.ciaPointsTotal || 0, r.totalCostCents || 0);

      const hay = [
        r.numero,
        r.id,
        r.ciaProgram || "",
        String(r.ciaPointsTotal || 0),
        fmtMoneyBR(r.totalCostCents || 0),
        m ? fmtMoneyBR(m) : "",
        ced?.nomeCompleto || "",
        ced?.cpf || "",
        ced?.identificador || "",
      ]
        .join(" ")
        .toLowerCase();

      if (dig.length >= 2) {
        const hayDigits = onlyDigits(hay);
        if (hayDigits.includes(dig)) return true;
      }
      return norm(hay).includes(needle);
    });
  }, [rows, q, status]);

  async function onRelease(id: string) {
    const okConfirm = window.confirm("Liberar esta compra? Isso vai aplicar saldo e travar a compra.");
    if (!okConfirm) return;

    setBusyId(id);
    setErr(null);

    try {
      await api<{ ok: true }>(`/api/compras/${id}/liberar`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      // recarrega do zero para evitar inconsistência com paginação
      resetPagination();
      await load({ silent: true, append: false });
    } catch (e: any) {
      setErr(e?.message || "Falha ao liberar.");
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(id: string) {
    const okConfirm = window.confirm("Cancelar esta compra? (não deve alterar saldo se ainda não foi liberada)");
    if (!okConfirm) return;

    setBusyId(id);
    setErr(null);

    try {
      try {
        await api<{ ok: true }>(`/api/compras/${id}/cancelar`, { method: "POST" });
      } catch (e: any) {
        const msg = String(e?.message || "");
        const isMethodOrRoute = msg.includes("Erro 404") || msg.includes("Erro 405");
        if (!isMethodOrRoute) throw e;

        await api<{ ok: true }>(`/api/compras/${id}`, { method: "DELETE" });
      }

      resetPagination();
      await load({ silent: true, append: false });
    } catch (e: any) {
      setErr(e?.message || "Falha ao cancelar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Compras</h1>
          <p className="text-sm text-gray-600">Visualize, edite, libere ou cancele compras.</p>
        </div>

        <Link href="/dashboard/compras/nova" className="rounded-md bg-black px-3 py-2 text-sm text-white">
          + Nova compra
        </Link>
      </div>

      <div className="rounded-xl border p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm text-gray-600">Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Número, nome, CPF, identificador..."
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="OPEN">Aberta</option>
              <option value="DRAFT">Rascunho</option>
              <option value="READY">Pronta</option>
              <option value="CLOSED">Liberada</option>
              <option value="CANCELED">Cancelada</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                resetPagination();
                void load({ append: false });
              }}
              disabled={loading || loadingMore}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {loading ? "Carregando..." : "Aplicar filtros"}
            </button>

            <button
              type="button"
              onClick={() => {
                setQ("");
                setStatus("");
                resetPagination();
                setTimeout(() => void load({ append: false }), 0);
              }}
              disabled={loading || loadingMore}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="overflow-auto rounded-xl border">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">Compra</th>
              <th className="p-3">Status</th>
              <th className="p-3">Cedente</th>
              <th className="p-3">CIA</th>
              <th className="p-3">Pts CIA</th>
              <th className="p-3">Milheiro</th>
              <th className="p-3">Total</th>
              <th className="p-3">Criada em</th>
              <th className="p-3"></th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="p-4 text-gray-500">
                  Nenhuma compra encontrada.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const isBusy = busyId === r.id;
              const isReleased = r.status === "CLOSED";
              const isCanceled = r.status === "CANCELED";

              const m = milheiroCents(r.ciaPointsTotal || 0, r.totalCostCents || 0);

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <div className="font-mono" title={r.id}>
                      {r.numero}
                    </div>
                  </td>

                  <td className="p-3">
                    <StatusPill status={r.status} />
                  </td>

                  <td className="p-3">
                    {r.cedente ? (
                      <div className="space-y-0.5">
                        <div className="font-medium">{r.cedente.nomeCompleto}</div>
                        <div className="text-xs text-gray-500">
                          CPF {r.cedente.cpf} · {r.cedente.identificador}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>

                  <td className="p-3">{r.ciaProgram || "—"}</td>

                  <td className="p-3 font-mono">{(r.ciaPointsTotal || 0).toLocaleString("pt-BR")}</td>

                  <td className="p-3 font-medium">
                    {m ? fmtMoneyBR(m) : <span className="text-gray-500">—</span>}
                    <div className="text-[11px] text-gray-500">por 1.000 pts</div>
                  </td>

                  <td className="p-3 font-medium">{fmtMoneyBR(r.totalCostCents || 0)}</td>

                  <td className="p-3">{fmtDateBR(r.createdAt)}</td>

                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/dashboard/compras/${r.id}`} className="rounded-md border px-2 py-1 text-xs">
                        Editar
                      </Link>

                      <button
                        type="button"
                        onClick={() => setPointsModalId(r.id)}
                        disabled={isBusy || isCanceled || !isReleased}
                        className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                        title="Adicionar mais itens de compra de pontos usando o mesmo ID"
                      >
                        Comprar mais
                      </button>

                      <button
                        type="button"
                        onClick={() => void onRelease(r.id)}
                        disabled={isBusy || isReleased || isCanceled}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        {isBusy ? "..." : "Liberar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void onCancel(r.id)}
                        disabled={isBusy || isCanceled || isReleased}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                      >
                        {isBusy ? "..." : "Cancelar"}
                      </button>
                    </div>

                    {(isReleased || isCanceled) && (
                      <div className="mt-1 text-[11px] text-gray-500 text-right">
                        {isReleased ? "travada" : "cancelada"}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {loading && (
              <tr>
                <td colSpan={9} className="p-4 text-gray-500">
                  Carregando...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ Botão Carregar mais (sempre usa o dataset já trazido do backend, sem refazer filtro local) */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void load({ append: true })}
            disabled={loading || loadingMore}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}

      <div className="text-xs text-gray-500">Dica: “Comprar mais” adiciona POINTS_BUY mesmo liberada, mantendo o ID.</div>

      <PointsBuyModal
        open={!!pointsModalId}
        purchaseId={pointsModalId}
        onClose={() => setPointsModalId(null)}
        onSaved={() => {
          // recarrega do zero para refletir totais/itens alterados
          resetPagination();
          void load({ silent: true, append: false });
        }}
      />
    </div>
  );
}

function toCentsFromInput(v: string) {
  const cleaned = String(v || "").trim().replace(",", ".");
  const n = Number(cleaned || 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function PointsBuyModal(props: {
  open: boolean;
  purchaseId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { open, purchaseId, onClose, onSaved } = props;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [numero, setNumero] = useState<string>("");
  const [cia, setCia] = useState<LoyaltyProgram | null>(null);
  const [rows, setRows] = useState<PointsBuyRow[]>([]);

  useEffect(() => {
    if (!open || !purchaseId) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const out = await api<{
          ok: true;
          compra: { id: string; numero: string; status: PurchaseStatus; ciaProgram: LoyaltyProgram | null };
          items: Array<{ id: string; title: string; pointsFinal: number; amountCents: number }>;
        }>(`/api/compras/${purchaseId}/points`);

        setNumero(String(out?.compra?.numero || ""));
        setCia((out?.compra?.ciaProgram ?? null) as any);

        const mapped: PointsBuyRow[] = (out.items || []).map((it) => ({
          id: it.id,
          title: String(it.title || "Compra de pontos"),
          pointsFinal: asInt(it.pointsFinal, 0),
          amountCents: asInt(it.amountCents, 0),
          remove: false,
        }));

        setRows(mapped);
      } catch (e: any) {
        setErr(e?.message || "Falha ao carregar itens.");
        setRows([]);
        setNumero("");
        setCia(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, purchaseId]);

  if (!open || !purchaseId) return null;

  const canSave = !saving && !loading;

  function addRow() {
    setRows((s) => [
      ...s,
      { title: "Compra de pontos", pointsFinal: 0, amountCents: 0, remove: false },
    ]);
  }

  const visibleRows = rows.filter((r) => !r.remove);
  const totalPoints = visibleRows.reduce((acc, r) => acc + asInt(r.pointsFinal, 0), 0);
  const totalCost = visibleRows.reduce((acc, r) => acc + asInt(r.amountCents, 0), 0);
  const avgMilheiro = milheiroCents(totalPoints, totalCost);

  async function onSave() {
    setErr(null);

    if (!cia) {
      setErr("Compra sem CIA definida.");
      return;
    }

    const deleteIds = rows.filter((r) => r.remove && r.id).map((r) => r.id!) as string[];
    const items = rows
      .filter((r) => !r.remove)
      .map((r) => ({
        id: r.id,
        title: String(r.title || "Compra de pontos").trim(),
        pointsFinal: asInt(r.pointsFinal, 0),
        amountCents: asInt(r.amountCents, 0),
      }))
      .filter((r) => r.pointsFinal > 0);

    if (items.length === 0 && deleteIds.length === 0) {
      setErr("Adicione ao menos 1 item com pontos > 0 (ou marque algo para remover).");
      return;
    }

    setSaving(true);
    try {
      await api<{ ok: true; deltaPoints?: number }>(`/api/compras/${purchaseId}/points`, {
        method: "POST",
        body: JSON.stringify({ items, deleteIds }),
      });

      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <div className="text-sm text-gray-600">Comprar mais (mesmo ID)</div>
            <div className="text-lg font-semibold">
              Compra <span className="font-mono">{numero || "—"}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Isto cria/edita itens <b>POINTS_BUY</b>. Se a compra estiver <b>LIBERADA</b>, aplica o delta no saldo do
              cedente também.
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border px-2 py-1">
                CIA: <b>{cia ?? "—"}</b>
              </span>
              <span className="rounded-full border px-2 py-1">
                Total pontos: <b className="font-mono">{totalPoints.toLocaleString("pt-BR")}</b>
              </span>
              <span className="rounded-full border px-2 py-1">
                Total custo: <b>{fmtMoneyBR(totalCost)}</b>
              </span>
              <span className="rounded-full border px-2 py-1">
                Milheiro médio: <b>{avgMilheiro ? fmtMoneyBR(avgMilheiro) : "—"}</b>
                <span className="text-gray-500"> / 1.000</span>
              </span>
            </div>
          </div>

          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
            Fechar
          </button>
        </div>

        <div className="space-y-3 p-4">
          {err && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

          {loading ? (
            <div className="text-sm text-gray-600">Carregando...</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Itens de compra de pontos</div>
                <button
                  type="button"
                  onClick={addRow}
                  disabled={!canSave}
                  className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  + Adicionar linha
                </button>
              </div>

              {rows.length === 0 ? (
                <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-600">
                  Nenhum item POINTS_BUY ainda. Clique em “Adicionar linha”.
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left">
                        <th className="p-2">Remover</th>
                        <th className="p-2">Título</th>
                        <th className="p-2">Pontos</th>
                        <th className="p-2">Custo (R$)</th>
                        <th className="p-2">Milheiro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const m = milheiroCents(r.pointsFinal || 0, r.amountCents || 0);

                        return (
                          <tr key={r.id ?? `new_${idx}`} className="border-t">
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={!!r.remove}
                                onChange={(e) =>
                                  setRows((s) => {
                                    const next = [...s];
                                    next[idx] = { ...next[idx], remove: e.target.checked };
                                    return next;
                                  })
                                }
                              />
                            </td>

                            <td className="p-2">
                              <input
                                value={r.title}
                                disabled={!!r.remove}
                                onChange={(e) =>
                                  setRows((s) => {
                                    const next = [...s];
                                    next[idx] = { ...next[idx], title: e.target.value };
                                    return next;
                                  })
                                }
                                className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                placeholder="Ex: Compra extra 10k"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="number"
                                value={r.pointsFinal}
                                disabled={!!r.remove}
                                onChange={(e) =>
                                  setRows((s) => {
                                    const next = [...s];
                                    next[idx] = { ...next[idx], pointsFinal: asInt(e.target.value, 0) };
                                    return next;
                                  })
                                }
                                className="w-full rounded-md border px-3 py-2 text-sm font-mono disabled:opacity-50"
                                placeholder="10000"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="number"
                                value={(r.amountCents || 0) / 100}
                                disabled={!!r.remove}
                                onChange={(e) =>
                                  setRows((s) => {
                                    const next = [...s];
                                    next[idx] = { ...next[idx], amountCents: toCentsFromInput(e.target.value) };
                                    return next;
                                  })
                                }
                                className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                placeholder="0"
                              />
                            </td>

                            <td className="p-2">
                              <div className={`text-sm font-medium ${r.remove ? "text-gray-400" : ""}`}>
                                {m ? fmtMoneyBR(m) : <span className="text-gray-500">—</span>}
                              </div>
                              <div className={`text-[11px] ${r.remove ? "text-gray-300" : "text-gray-500"}`}>
                                por 1.000 pts
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                  Cancelar
                </button>
                <button type="button" onClick={onSave} disabled={!canSave} className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
