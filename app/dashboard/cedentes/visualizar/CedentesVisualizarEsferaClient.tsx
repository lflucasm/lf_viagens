"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type SortField = "pontos" | "score" | "nome" | "responsavel" | "identificador";
type SortDir = "asc" | "desc";

type CedenteRow = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosEsfera: number;
  scoreMedia?: number;
  owner: { id: string; name: string; login: string };
  blockedPrograms?: Program[];
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function maskCpf(cpf: string) {
  const v = String(cpf || "").replace(/\D+/g, "");
  if (v.length !== 11) return cpf || "-";
  return `***.***.${v.slice(6, 9)}-${v.slice(9, 11)}`;
}

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
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

function isEsferaBlocked(r: CedenteRow) {
  return (r.blockedPrograms || []).includes("ESFERA");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function CedentesVisualizarEsferaClient() {
  const router = useRouter();

  const [rows, setRows] = useState<CedenteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("pontos");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/cedentes/approved", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar cedentes");

      const cedentes: CedenteRow[] = j.data || [];
      setRows(cedentes);
      setEditingId(null);
      setDraftPoints("");
      setSavingId(null);
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao carregar."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => r.owner?.id && map.set(r.owner.id, r.owner.name));
    return Array.from(map.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ownerFilter && r.owner?.id !== ownerFilter) return false;
      if (!s) return true;
      return (
        r.nomeCompleto.toLowerCase().includes(s) ||
        r.identificador.toLowerCase().includes(s) ||
        String(r.cpf || "").includes(s)
      );
    });
  }, [rows, q, ownerFilter]);

  const sortedRows = useMemo(() => {
    const list = [...filtered];
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "pontos") {
        cmp = (a.pontosEsfera || 0) - (b.pontosEsfera || 0);
      } else if (sortField === "score") {
        cmp = normalizeScore(a.scoreMedia) - normalizeScore(b.scoreMedia);
      } else if (sortField === "nome") {
        cmp = collator.compare(a.nomeCompleto || "", b.nomeCompleto || "");
      } else if (sortField === "responsavel") {
        cmp = collator.compare(a.owner?.name || "", b.owner?.name || "");
      } else if (sortField === "identificador") {
        cmp = collator.compare(a.identificador || "", b.identificador || "");
      }

      if (cmp === 0) cmp = collator.compare(a.nomeCompleto || "", b.nomeCompleto || "");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [filtered, sortField, sortDir]);

  async function savePoints(cedenteId: string) {
    const n = Number(String(draftPoints || "").replace(/\D+/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      alert("Pontos inválidos.");
      return;
    }

    setSavingId(cedenteId);
    try {
      const res = await fetch(`/api/cedentes/${cedenteId}/pontos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program: "ESFERA", points: Math.trunc(n) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar pontos");

      setRows((prev) =>
        prev.map((r) => (r.id === cedenteId ? { ...r, pontosEsfera: json.points } : r))
      );
      setEditingId(null);
      setDraftPoints("");
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Erro ao salvar pontos."));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cedentes • Esfera</h1>
          <p className="text-sm text-slate-600">
            Pontos Esfera com score médio operacional (0 a 10).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Buscar nome / identificador / CPF..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="">Todos responsáveis</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
          >
            <option value="pontos">Ordenar por: Pontos Esfera</option>
            <option value="score">Ordenar por: Score médio</option>
            <option value="nome">Ordenar por: Nome</option>
            <option value="responsavel">Ordenar por: Responsável</option>
            <option value="identificador">Ordenar por: Identificador</option>
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
          >
            <option value="desc">Maior → menor (Z-A)</option>
            <option value="asc">Menor → maior (A-Z)</option>
          </select>

          <button
            onClick={load}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Th>Nome</Th>
              <Th>Responsável</Th>
              <ThRight>Score</ThRight>
              <ThRight>Pontos (Esfera)</ThRight>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
                Ações
              </th>
            </tr>
          </thead>

          <tbody>
            {!loading && sortedRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">
                  Nenhum cedente encontrado.
                </td>
              </tr>
            )}

            {sortedRows.map((r) => {
              const blocked = isEsferaBlocked(r);
              return (
                <tr
                  key={r.id}
                  className={cn("border-t", blocked ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50")}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-2">
                      <span>{r.nomeCompleto}</span>
                      {blocked ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide border border-red-300 rounded px-2 py-0.5 text-red-700">
                          Bloqueado
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.identificador} • CPF: {maskCpf(r.cpf)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{r.owner?.name}</div>
                    <div className="text-xs text-slate-500">@{r.owner?.login}</div>
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
                    {editingId === r.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          className="w-[140px] rounded-lg border px-2 py-1 text-sm text-right"
                          value={draftPoints}
                          onChange={(e) => setDraftPoints(e.target.value)}
                          inputMode="numeric"
                        />
                        <button
                          className="rounded-lg bg-black px-3 py-1 text-xs text-white disabled:opacity-60"
                          disabled={savingId === r.id}
                          onClick={() => savePoints(r.id)}
                          type="button"
                        >
                          {savingId === r.id ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-white"
                          onClick={() => {
                            setEditingId(null);
                            setDraftPoints("");
                          }}
                          type="button"
                          disabled={savingId === r.id}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span className={cn("font-medium", blocked ? "text-red-700" : "")}>
                        {fmtInt(r.pontosEsfera)}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => router.push(`/dashboard/cedentes/${r.id}`)}
                      >
                        Ver
                      </button>

                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => {
                          setEditingId(r.id);
                          setDraftPoints(String(r.pontosEsfera || 0));
                        }}
                        disabled={savingId === r.id}
                      >
                        Editar pontos
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <div className="mt-4 text-sm text-slate-500">Carregando…</div>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

function ThRight({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
      {children}
    </th>
  );
}
