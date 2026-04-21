"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, Coins, Copy, Eye, KeyRound, MessageCircle, Pencil, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Owner = { id: string; name: string; login: string };

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone?: string | null;
  emailCriado?: string | null;
  senhaEmail?: string | null;
  senhaSmiles?: string | null;
  scoreMedia?: number;

  owner: Owner;

  smilesAprovado: number;
  smilesPendente: number;
  smilesTotalEsperado: number;

  // ✅ NOVO
  smilesPassengersYear: number;
  smilesPassengersLimit: number;
  smilesPassengersUsed: number;
  smilesPassengersRemaining: number;
};

type SortBy = "aprovado" | "esperado";

function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function normalizeScore(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}
function fmtScore(v: unknown) {
  return normalizeScore(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
function scorePillClass(v: unknown) {
  const s = normalizeScore(v);
  if (s >= 8) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s >= 6) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s >= 4) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function onlyDigitsToInt(v: string) {
  const n = Number(String(v || "").replace(/\D+/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function whatsappHref(telefone?: string | null) {
  let d = String(telefone || "").replace(/\D+/g, "");
  if (!d) return null;

  while (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;

  return `https://wa.me/${d}`;
}

function ActionTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

export default function CedentesVisualizarSmilesClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("aprovado");

  // edição inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [credentialsRow, setCredentialsRow] = useState<Row | null>(null);
  const [copiedField, setCopiedField] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerId) params.set("ownerId", ownerId);

      const res = await fetch(`/api/cedentes/smiles?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar");

      setRows(data.rows || []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ownerId]);

  const owners = useMemo(() => {
    const map = new Map<string, Owner>();
    for (const r of rows) map.set(r.owner.id, r.owner);
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [rows]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = sortBy === "aprovado" ? a.smilesAprovado : a.smilesTotalEsperado;
      const bv = sortBy === "aprovado" ? b.smilesAprovado : b.smilesTotalEsperado;

      if (bv !== av) return bv - av;
      return a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR");
    });
    return list;
  }, [rows, sortBy]);

  function startEdit(r: Row) {
    setEditingId(r.id);
    setDraft(String(r.smilesAprovado ?? 0));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function saveEdit(id: string) {
    const newValue = onlyDigitsToInt(draft);
    if (!confirm(`Atualizar SMILES para ${fmtInt(newValue)}?`)) return;

    setSaving(true);
    try {
      const res = await fetch("/api/cedentes/smiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pontosSmiles: newValue }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      setRows((prev) =>
        prev.map((r) =>
          r.id !== id
            ? r
            : {
                ...r,
                smilesAprovado: newValue,
                smilesTotalEsperado: (r.smilesPendente || 0) + newValue,
              }
        )
      );

      cancelEdit();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function copyValue(fieldId: string, value?: string | null) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      window.setTimeout(() => {
        setCopiedField((curr) => (curr === fieldId ? "" : curr));
      }, 1400);
    } catch {
      // noop
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cedentes • Smiles</h1>
          <p className="text-sm text-slate-500">
            Pontos aprovados, pendentes, total esperado e passageiros disponíveis em 2026 (SMILES).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className={cn(
              "border rounded-lg px-4 py-2 text-sm",
              loading ? "opacity-60" : "hover:bg-slate-50"
            )}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          <Link
            href="/dashboard/cedentes/visualizar?programa=latam"
            className="border rounded-lg px-4 py-2 text-sm hover:bg-slate-50"
          >
            Ir para LATAM
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nome / identificador / CPF..."
          className="border rounded-lg px-3 py-2 text-sm w-64"
        />

        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm min-w-[220px]"
        >
          <option value="">Todos responsáveis</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} (@{o.login})
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="border rounded-lg px-3 py-2 text-sm min-w-[240px]"
          title="Ordenar do maior para o menor"
        >
          <option value="aprovado">Ordenar: SMILES (aprovado) ↓</option>
          <option value="esperado">Ordenar: TOTAL esperado ↓</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="mt-4 border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[380px]">NOME</th>
                <th className="text-left font-semibold px-4 py-3 w-[260px]">RESPONSÁVEL</th>
                <th className="text-right font-semibold px-4 py-3 w-[120px]">SCORE</th>

                <th className="text-right font-semibold px-4 py-3 w-[160px]">SMILES</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">PENDENTES</th>
                <th className="text-right font-semibold px-4 py-3 w-[180px]">TOTAL ESPERADO</th>

                {/* ✅ NOVO */}
                <th className="text-right font-semibold px-4 py-3 w-[190px]">DISPONÍVEL 2026</th>

                <th className="text-right font-semibold px-4 py-3 w-[220px]">AÇÕES</th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={8}>
                    Nenhum resultado.
                  </td>
                </tr>
              ) : null}

              {sortedRows.map((r) => {
                const isEditing = editingId === r.id;
                const waHref = whatsappHref(r.telefone);
                const actionBtnBase =
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors";
                const neutralActionBtnCls = cn(
                  actionBtnBase,
                  "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                );
                const whatsappActionBtnCls = cn(
                  actionBtnBase,
                  "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                );

                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">
                        {r.identificador} • CPF: {maskCpf(r.cpf)}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.owner.name}</div>
                      <div className="text-xs text-slate-500">@{r.owner.login}</div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-1 text-xs",
                          scorePillClass(r.scoreMedia)
                        )}
                      >
                        {fmtScore(r.scoreMedia)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className="border rounded-lg px-2 py-1 text-right w-[140px]"
                          inputMode="numeric"
                        />
                      ) : (
                        fmtInt(r.smilesAprovado)
                      )}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.smilesPendente)}</td>

                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.smilesTotalEsperado)}</td>

                    {/* ✅ NOVO: passageiros disponíveis 2026 */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        title={`Usados: ${fmtInt(r.smilesPassengersUsed)} / Limite: ${fmtInt(
                          r.smilesPassengersLimit
                        )} (ano ${r.smilesPassengersYear})`}
                        className={cn(
                          "inline-flex items-center justify-end rounded-md px-2 py-1 text-xs",
                          r.smilesPassengersRemaining > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        )}
                      >
                        {fmtInt(r.smilesPassengersRemaining)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(r.id)}
                              disabled={saving}
                              className={cn(neutralActionBtnCls, "group relative", saving && "opacity-60")}
                              title="Salvar edição SMILES"
                            >
                              <Check size={15} />
                              <span className="sr-only">Salvar</span>
                              <ActionTooltip label={saving ? "Salvando..." : "Salvar"} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Cancelar edição"
                            >
                              <X size={15} />
                              <span className="sr-only">Cancelar</span>
                              <ActionTooltip label="Cancelar" />
                            </button>
                          </>
                        ) : (
                          <>
                            {waHref ? (
                              <a
                                href={waHref}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(whatsappActionBtnCls, "group relative")}
                                title="Abrir conversa no WhatsApp do cedente"
                              >
                                <MessageCircle size={15} />
                                <span className="sr-only">WhatsApp</span>
                                <ActionTooltip label="WhatsApp" />
                              </a>
                            ) : null}

                            <button
                              onClick={() => startEdit(r)}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Editar SMILES"
                            >
                              <Pencil size={15} />
                              <span className="sr-only">Editar SMILES</span>
                              <ActionTooltip label="Editar SMILES" />
                            </button>

                            <Link
                              href={`/dashboard/cedentes/visualizar/${r.id}`}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Ver cedente"
                            >
                              <Eye size={15} />
                              <span className="sr-only">Ver</span>
                              <ActionTooltip label="Ver cedente" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => setCredentialsRow(r)}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Credenciais para transação"
                            >
                              <KeyRound size={15} />
                              <span className="sr-only">Credenciais</span>
                              <ActionTooltip label="CPF/E-mail/Senhas" />
                            </button>

                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/cedentes/${r.id}?edit=1`)}
                              className={cn(neutralActionBtnCls, "group relative")}
                              title="Abrir detalhe em modo edição para ajustar pontos"
                            >
                              <Coins size={15} />
                              <span className="sr-only">Editar pontos</span>
                              <ActionTooltip label="Editar pontos" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={8}>
                    Carregando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        * “Disponível 2026” = limite anual − passageiros emitidos em 2026 (programa SMILES), baseado em <b>emission_events</b>.
      </p>

      {credentialsRow ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Fechar credenciais"
            onClick={() => setCredentialsRow(null)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Credenciais para transação</div>
                <div className="text-sm text-slate-500">
                  {credentialsRow.nomeCompleto} • {credentialsRow.identificador}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCredentialsRow(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-100"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">CPF (login)</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.cpf || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("cpf", credentialsRow.cpf)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "cpf" ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="rounded-xl border bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Senha SMILES</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.senhaSmiles || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("senhaSmiles", credentialsRow.senhaSmiles)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "senhaSmiles" ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="rounded-xl border bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">E-mail</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.emailCriado || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("email", credentialsRow.emailCriado)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "email" ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="rounded-xl border bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Senha do e-mail</div>
                <div className="mt-1 break-all font-medium">{credentialsRow.senhaEmail || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue("senhaEmail", credentialsRow.senhaEmail)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === "senhaEmail" ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
