"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type UserLite = { id: string; name: string; login: string; role: string };

type Row = {
  owner: UserLite;
  cedentesCount: number;
  items: Array<{
    payeeId: string;
    bps: number;
    payee: { id: string; name: string; login: string };
  }>;
  sumBps: number;
  isDefault: boolean;

  // ✅ opcionais (se GET já devolver, mostramos; se não, segue normal)
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

function fmtPct(bps: number) {
  const v = (Number(bps || 0) / 100).toFixed(2).replace(".", ",");
  return `${v}%`;
}

function n(v: any, fb = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fb;
}

function pad2(x: number) {
  return String(x).padStart(2, "0");
}

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysISODate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtDateBR(isoOrDate?: string | null) {
  if (!isoOrDate) return "";
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
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

  if (!res.ok || data?.ok === false) throw new Error(data?.error || `Erro ${res.status}`);
  return data as T;
}

type EditItem = { payeeId: string; percent: number };

export default function RateioClient() {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [saving, setSaving] = useState(false);

  // ✅ NOVO: vigência do rateio
  const [effectiveFrom, setEffectiveFrom] = useState<string>(addDaysISODate(1)); // default: amanhã
  const minEffectiveFrom = todayISODate();

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setErr(null);
    try {
      const out = await api<{ ok: true; users: UserLite[]; rows: Row[] }>("/api/funcionarios/rateio");
      setUsers(out.users || []);
      setRows(out.rows || []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
      setUsers([]);
      setRows([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = [r.owner.name, r.owner.login, r.owner.role, String(r.cedentesCount)].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const configured = filtered.filter((r) => !r.isDefault).length;
    const missing = total - configured;
    return { total, configured, missing };
  }, [filtered]);

  function openEdit(r: Row) {
    setEditingOwnerId(r.owner.id);

    const items = (r.items || []).map((it) => ({
      payeeId: it.payeeId,
      percent: Math.round((n(it.bps) / 100) * 100) / 100, // bps -> %
    }));

    if (!items.length) items.push({ payeeId: r.owner.id, percent: 100 });
    setEditItems(items);

    // ✅ regra: novo rateio vale a partir de X data.
    // default: amanhã, mas se tiver uma vigência futura já no row, pré-preenche.
    const ef = r.effectiveFrom ? new Date(r.effectiveFrom) : null;
    const now = new Date();
    if (ef && !Number.isNaN(ef.getTime()) && ef.getTime() > now.getTime()) {
      setEffectiveFrom(`${ef.getFullYear()}-${pad2(ef.getMonth() + 1)}-${pad2(ef.getDate())}`);
    } else {
      setEffectiveFrom(addDaysISODate(1));
    }
  }

  function closeEdit() {
    setEditingOwnerId(null);
    setEditItems([]);
    setSaving(false);
    setEffectiveFrom(addDaysISODate(1));
  }

  const sumPercent = useMemo(() => {
    const s = editItems.reduce((acc, it) => acc + n(it.percent), 0);
    return Math.round(s * 100) / 100;
  }, [editItems]);

  const hasEmptyPayee = useMemo(() => editItems.some((it) => !String(it.payeeId || "").trim()), [editItems]);

  const canSave =
    Boolean(editingOwnerId) &&
    editItems.length > 0 &&
    !hasEmptyPayee &&
    Math.abs(sumPercent - 100) < 0.001 &&
    Boolean(effectiveFrom) &&
    effectiveFrom >= minEffectiveFrom;

  async function saveEdit() {
    if (!editingOwnerId) return;

    if (!effectiveFrom || effectiveFrom < minEffectiveFrom) {
      alert("Escolha uma data válida (não pode ser no passado).");
      return;
    }
    if (hasEmptyPayee) {
      alert("Existe destinatário vazio. Selecione todos os destinatários.");
      return;
    }
    if (Math.abs(sumPercent - 100) >= 0.001) {
      alert("O rateio precisa somar 100%.");
      return;
    }

    setSaving(true);
    setErr(null);

    try {
      await api<{ ok: true }>("/api/funcionarios/rateio", {
        method: "PUT",
        body: JSON.stringify({
          ownerId: editingOwnerId,
          effectiveFrom, // ✅ NOVO (YYYY-MM-DD)
          items: editItems.map((it) => ({ payeeId: it.payeeId, percent: it.percent })),
        }),
      });

      await load({ silent: true });
      closeEdit();
      alert("Rateio salvo.");
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar rateio.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Rateio do lucro (base percentual)</h1>
          <p className="text-sm text-gray-600">
            Configure como o lucro líquido será dividido por <b>grupo do dono do cedente</b> (owner).
            <br />
            <span className="text-gray-500">
              ✅ Alterações não mudam histórico: você define uma <b>data de vigência</b> e o novo rateio só vale a partir
              dela.
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Funcionários listados</div>
          <div className="mt-1 text-xl font-semibold">{totals.total}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Com rateio configurado</div>
          <div className="mt-1 text-xl font-semibold">{totals.configured}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Sem rateio (default 100% para si)</div>
          <div className="mt-1 text-xl font-semibold">{totals.missing}</div>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Buscar funcionário..."
        />
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="overflow-auto rounded-xl border">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">Funcionário (owner)</th>
              <th className="p-3">Login</th>
              <th className="p-3">Cedentes</th>
              <th className="p-3">Vigência</th>
              <th className="p-3">Rateio</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-4 text-gray-500">
                  Nenhum resultado.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const summary = (r.items || [])
                .map((it) => `${fmtPct(it.bps)} → ${it.payee?.name || it.payeeId}`)
                .join(" · ");

              const vig =
                r.effectiveFrom || r.effectiveTo
                  ? `${r.effectiveFrom ? fmtDateBR(r.effectiveFrom) : "—"} → ${r.effectiveTo ? fmtDateBR(r.effectiveTo) : "∞"}`
                  : "—";

              return (
                <tr key={r.owner.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{r.owner.name}</div>
                    <div className="text-xs text-gray-500">{r.owner.role}</div>
                  </td>
                  <td className="p-3 font-mono">{r.owner.login}</td>
                  <td className="p-3">{r.cedentesCount}</td>
                  <td className="p-3">
                    <div className="text-sm">{vig}</div>
                    {r.isDefault && <div className="text-xs text-amber-700">default</div>}
                  </td>
                  <td className="p-3">
                    <div className="text-sm">{summary || "100% → (self)"}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        {r.isDefault ? "Configurar" : "Novo rateio"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {loading && (
              <tr>
                <td colSpan={6} className="p-4 text-gray-500">
                  Carregando...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {editingOwnerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg">
            <div className="border-b p-4">
              <div className="text-lg font-semibold">Criar novo rateio (com vigência)</div>
              <div className="text-sm text-gray-600">
                A soma precisa dar 100% e o novo rateio só vale a partir da data escolhida.
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Vigência */}
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">Vigente a partir de</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input
                    type="date"
                    value={effectiveFrom}
                    min={minEffectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="rounded-md border px-3 py-2 text-sm"
                  />
                  <div className="text-xs text-gray-500">
                    (mínimo: <b>{fmtDateBR(minEffectiveFrom)}</b>)
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Dica: se você quer “não mexer no passado”, escolha uma data futura.
                </div>
              </div>

              {/* Soma */}
              <div className="rounded-md border p-3 text-sm">
                Soma atual:{" "}
                <b className={Math.abs(sumPercent - 100) < 0.001 ? "text-green-700" : "text-red-700"}>
                  {sumPercent.toFixed(2).replace(".", ",")}%
                </b>
              </div>

              {/* Tabela */}
              <div className="overflow-auto rounded-lg border">
                <table className="min-w-[700px] w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left">
                      <th className="p-2">Destinatário</th>
                      <th className="p-2">%</th>
                      <th className="p-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((it, idx) => (
                      <tr key={`${it.payeeId}-${idx}`} className="border-t">
                        <td className="p-2">
                          <select
                            value={it.payeeId}
                            onChange={(e) =>
                              setEditItems((arr) =>
                                arr.map((x, i) => (i === idx ? { ...x, payeeId: e.target.value } : x))
                              )
                            }
                            className="w-full rounded-md border px-2 py-1"
                            disabled={!users.length}
                          >
                            {users.length === 0 ? (
                              <option value="">Sem usuários</option>
                            ) : (
                              users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name} ({u.login})
                                </option>
                              ))
                            )}
                          </select>
                        </td>

                        <td className="p-2">
                          <input
                            value={String(it.percent)}
                            onChange={(e) => {
                              const v = e.target.value.replace(",", ".");
                              const num = Number(v);
                              setEditItems((arr) =>
                                arr.map((x, i) => (i === idx ? { ...x, percent: Number.isFinite(num) ? num : 0 } : x))
                              );
                            }}
                            className="w-32 rounded-md border px-2 py-1"
                            inputMode="decimal"
                          />
                        </td>

                        <td className="p-2">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditItems((arr) => arr.filter((_, i) => i !== idx))}
                              className="rounded-md border px-2 py-1 text-xs"
                              disabled={editItems.length <= 1}
                              title={editItems.length <= 1 ? "Precisa ter ao menos 1 linha" : "Remover"}
                            >
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditItems((arr) => [...arr, { payeeId: users[0]?.id || "", percent: 0 }])
                }
                className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                disabled={!users.length}
              >
                + Adicionar linha
              </button>

              {!canSave && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Para salvar: data válida (não passada), destinatários preenchidos e soma = 100%.
                </div>
              )}
            </div>

            <div className="border-t p-4 flex items-center justify-end gap-2">
              <button type="button" onClick={closeEdit} className="rounded-md border px-3 py-2 text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!canSave || saving}
                className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
