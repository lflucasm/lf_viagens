"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Status = "ACTIVE" | "PAUSED" | "CANCELED" | "NEVER";

type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ClubCell = {
  id: string;
  program: Program;
  status: Exclude<Status, "NEVER">;
  tierK: number;
  subscribedAt: string;
  pointsExpireAt: string | null;
  smilesBonusEligibleAt: string | null;
  updatedAt: string;
};

type MatrixRow = {
  cedente: CedenteLite;
  LATAM: ClubCell | null;
  SMILES: ClubCell | null;
  LIVELO: ClubCell | null;
  ESFERA: ClubCell | null;
};

async function jfetch(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.ok) throw new Error(json?.error || "Erro na requisição");
  return json;
}

function toDateSafe(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateBR(iso: string | null) {
  const d = toDateSafe(iso);
  if (!d) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function statusLabel(cell: ClubCell | null): Status {
  return cell?.status || "NEVER";
}

function pillClass(status: Status) {
  if (status === "ACTIVE") return "border-green-200 bg-green-50 text-green-700";
  if (status === "PAUSED") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  if (status === "CANCELED") return "border-red-200 bg-red-50 text-red-700";
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
}

function Cell({
  cell,
  program,
}: {
  cell: ClubCell | null;
  program: Program;
}) {
  const s = statusLabel(cell);

  const title =
    s === "NEVER"
      ? "Nunca assinado"
      : [
          `${program} • ${s}`,
          `Tier: ${cell?.tierK ?? "-"}k`,
          `Assinado: ${fmtDateBR(cell?.subscribedAt ?? null)}`,
          cell?.pointsExpireAt ? `Expira/Auto: ${fmtDateBR(cell.pointsExpireAt)}` : "",
          program === "SMILES" && cell?.smilesBonusEligibleAt
            ? `Promo novamente: ${fmtDateBR(cell.smilesBonusEligibleAt)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

  return (
    <div className="flex items-center gap-2" title={title}>
      <span
        className={[
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
          pillClass(s),
        ].join(" ")}
      >
        {s === "NEVER" ? "NUNCA" : s}
      </span>

      {cell && (
        <span className="text-xs text-neutral-500">{cell.tierK}k</span>
      )}
    </div>
  );
}

export default function ClubesListaClient({
  initialRows,
}: {
  initialRows: MatrixRow[];
}) {
  const [rows, setRows] = useState<MatrixRow[]>(initialRows || []);

  const [q, setQ] = useState("");
  const [filterProgram, setFilterProgram] = useState<"" | Program>("");
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function resetAlerts() {
    setErr(null);
    setMsg(null);
  }

  async function refresh() {
    resetAlerts();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (filterProgram) params.set("program", filterProgram);
      if (filterStatus) params.set("status", filterStatus);

      const qs = params.toString();
      const json = await jfetch(qs ? `/api/clubes/lista?${qs}` : "/api/clubes/lista");

      setRows(json.items || []);
      setMsg("Lista atualizada ✅");
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    const total = rows.length;

    const withAny =
      rows.filter((r) => r.LATAM || r.SMILES || r.LIVELO || r.ESFERA).length;

    const neverAll =
      rows.filter((r) => !r.LATAM && !r.SMILES && !r.LIVELO && !r.ESFERA).length;

    return { total, withAny, neverAll };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clube • Lista</h1>
          <p className="text-sm text-neutral-500">
            Matriz por cedente (LATAM/SMILES/LIVELO/ESFERA). Se não existir registro, aparece como <b>NUNCA</b>.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Total: {counts.total} • Com algum clube: {counts.withAny} • Nunca assinado (todos): {counts.neverAll}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/dashboard/clubes/cadastrar"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Cadastrar clube
          </Link>

          <button
            onClick={refresh}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            type="button"
          >
            {loading ? "Carregando..." : "Recarregar"}
          </button>
        </div>
      </div>

      {(msg || err) && (
        <div
          className={[
            "rounded-xl border px-3 py-2 text-sm",
            err
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700",
          ].join(" ")}
        >
          {err || msg}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border p-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Buscar (nome, identificador, cpf)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value as any)}
          >
            <option value="">Todos programas</option>
            <option value="LATAM">LATAM</option>
            <option value="SMILES">SMILES</option>
            <option value="LIVELO">LIVELO</option>
            <option value="ESFERA">ESFERA</option>
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
          >
            <option value="">Todos status</option>
            <option value="ACTIVE">ATIVO</option>
            <option value="PAUSED">PAUSADO</option>
            <option value="CANCELED">CANCELADO</option>
            <option value="NEVER">NUNCA</option>
          </select>

          <button
            onClick={refresh}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            type="button"
          >
            Aplicar filtros
          </button>
        </div>

        <div className="mt-2 text-[11px] text-neutral-400">
          Dica: se escolher um <b>programa</b> + status <b>NUNCA</b>, mostra quem não tem clube naquele programa.
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-medium">
            Registros: <span className="text-neutral-600">{rows.length}</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-4 py-2">Cedente</th>
                <th className="text-left px-4 py-2">LATAM</th>
                <th className="text-left px-4 py-2">SMILES</th>
                <th className="text-left px-4 py-2">LIVELO</th>
                <th className="text-left px-4 py-2">ESFERA</th>
                <th className="text-right px-4 py-2">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.cedente.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.cedente.nomeCompleto}</div>
                    <div className="text-xs text-neutral-500">
                      {r.cedente.identificador} • CPF {r.cedente.cpf}
                    </div>
                  </td>

                  <td className="px-4 py-2">
                    <Cell cell={r.LATAM} program="LATAM" />
                  </td>

                  <td className="px-4 py-2">
                    <Cell cell={r.SMILES} program="SMILES" />
                  </td>

                  <td className="px-4 py-2">
                    <Cell cell={r.LIVELO} program="LIVELO" />
                  </td>

                  <td className="px-4 py-2">
                    <Cell cell={r.ESFERA} program="ESFERA" />
                  </td>

                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/clubes/cadastrar?cedenteId=${encodeURIComponent(
                        r.cedente.id
                      )}`}
                      className="rounded-lg border px-2 py-1 text-xs hover:bg-white"
                    >
                      Cadastrar / editar
                    </Link>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={6}>
                    Nenhum cedente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
