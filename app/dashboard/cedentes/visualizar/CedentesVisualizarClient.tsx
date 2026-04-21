"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  scoreMedia?: number;
  createdAt: string;
  owner: { id: string; name: string; login: string };

  // ✅ vem da API
  blockedPrograms?: Program[];
};

type SortKey = "nome" | "score" | "latam" | "smiles" | "livelo" | "esfera";
type SortDir = "asc" | "desc";

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
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
  const v = String(cpf || "").replace(/\D+/g, "");
  if (v.length !== 11) return cpf || "-";
  return `***.***.${v.slice(6, 9)}-${v.slice(9, 11)}`;
}

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function isBlocked(r: Row, program: Program) {
  return (r.blockedPrograms || []).includes(program);
}

export default function CedentesVisualizarClient() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cedentes/approved", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error);
      setRows(json.data);
      setSelected(new Set());
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar.");
      setRows([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /* =======================
     Seleção
  ======================= */
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      if (ids.length === 0) return new Set();
      if (prev.size === ids.length) return new Set();
      return new Set(ids);
    });
  }

  /* =======================
     Delete (com senha do LOGIN)
  ======================= */
  async function askPassword(): Promise<string | null> {
    const password = prompt("Digite sua senha do login para confirmar:");
    const v = (password ?? "").trim();
    return v ? v : null;
  }

  async function deleteSelected() {
    if (!selected.size) return;

    if (!confirm(`Apagar ${selected.size} cedente(s) selecionado(s)?`)) return;

    const password = await askPassword();
    if (!password) return;

    const res = await fetch("/api/cedentes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), password }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Erro ao apagar selecionados.");
      return;
    }

    await load();
  }

  async function deleteAll() {
    if (!confirm("Isso vai apagar TODOS os cedentes. Continuar?")) return;

    const password = await askPassword();
    if (!password) return;

    const res = await fetch("/api/cedentes/delete-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Erro ao apagar todos.");
      return;
    }

    await load();
  }

  /* =======================
     Filtros / ordenação
  ======================= */
  const owners = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => r.owner?.id && map.set(r.owner.id, r.owner.name));
    return Array.from(map.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (ownerFilter && r.owner?.id !== ownerFilter) return false;
        if (!s) return true;

        return (
          r.nomeCompleto.toLowerCase().includes(s) ||
          r.identificador.toLowerCase().includes(s) ||
          String(r.cpf || "").includes(s)
        );
      })
      .sort((a, b) => {
        let va: number | string = "";
        let vb: number | string = "";

        switch (sortKey) {
          case "nome":
            va = a.nomeCompleto.toLowerCase();
            vb = b.nomeCompleto.toLowerCase();
            break;
          case "score":
            va = normalizeScore(a.scoreMedia);
            vb = normalizeScore(b.scoreMedia);
            break;
          case "latam":
            va = a.pontosLatam;
            vb = b.pontosLatam;
            break;
          case "smiles":
            va = a.pontosSmiles;
            vb = b.pontosSmiles;
            break;
          case "livelo":
            va = a.pontosLivelo;
            vb = b.pontosLivelo;
            break;
          case "esfera":
            va = a.pontosEsfera;
            vb = b.pontosEsfera;
            break;
        }

        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [rows, q, ownerFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nome" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  /* =======================
     UI
  ======================= */
  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cedentes • Todos</h1>
          <p className="text-sm text-slate-600">
            Cedentes aprovados com pontos e responsável
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white"
              disabled={loading}
              title="Apagar somente os marcados"
            >
              🗑️ Apagar selecionados ({selected.size})
            </button>
          )}

          <button
            onClick={deleteAll}
            className="rounded-xl border border-red-600 px-4 py-2 text-sm text-red-600"
            disabled={loading || rows.length === 0}
            title="Apagar todos os cedentes (perigoso)"
          >
            🧨 Apagar todos
          </button>

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
        <table className="min-w-[1060px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={() => toggleAll(filtered.map((r) => r.id))}
                  disabled={filtered.length === 0}
                  title="Selecionar todos filtrados"
                />
              </th>

              <Th onClick={() => toggleSort("nome")}>Nome{arrow("nome")}</Th>
              <Th>Responsável</Th>
              <ThRight onClick={() => toggleSort("score")}>Score{arrow("score")}</ThRight>

              <ThRight onClick={() => toggleSort("latam")}>LATAM{arrow("latam")}</ThRight>
              <ThRight onClick={() => toggleSort("smiles")}>SMILES{arrow("smiles")}</ThRight>
              <ThRight onClick={() => toggleSort("livelo")}>LIVELO{arrow("livelo")}</ThRight>
              <ThRight onClick={() => toggleSort("esfera")}>ESFERA{arrow("esfera")}</ThRight>

              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
                Ações
              </th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-500">
                  Nenhum cedente encontrado.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const hasAnyBlock = (r.blockedPrograms || []).length > 0;

              return (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      title="Selecionar"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div
                      className={cn("font-medium", hasAnyBlock && "text-red-600")}
                      title={hasAnyBlock ? `Bloqueado: ${(r.blockedPrograms || []).join(", ")}` : undefined}
                    >
                      {r.nomeCompleto}
                    </div>

                    <div className="text-xs text-slate-500">
                      {r.identificador} • CPF: {maskCpf(r.cpf)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{r.owner?.name}</div>
                    <div className="text-xs text-slate-500">@{r.owner?.login}</div>
                  </td>

                  <TdRight>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-1 text-xs",
                        scorePillClass(r.scoreMedia)
                      )}
                    >
                      {fmtScore(r.scoreMedia)}
                    </span>
                  </TdRight>

                  <TdRight className={isBlocked(r, "LATAM") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosLatam)}
                  </TdRight>

                  <TdRight className={isBlocked(r, "SMILES") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosSmiles)}
                  </TdRight>

                  <TdRight className={isBlocked(r, "LIVELO") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosLivelo)}
                  </TdRight>

                  <TdRight className={isBlocked(r, "ESFERA") ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosEsfera)}
                  </TdRight>

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
                        onClick={() => router.push(`/dashboard/cedentes/${r.id}?edit=1`)}
                        title="Abrir detalhe em modo edição"
                      >
                        Editar
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

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 cursor-pointer select-none"
    >
      {children}
    </th>
  );
}

function ThRight({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right cursor-pointer select-none"
    >
      {children}
    </th>
  );
}

function TdRight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 text-right tabular-nums", className)}>{children}</td>;
}
