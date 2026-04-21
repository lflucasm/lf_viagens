"use client";

import { useEffect, useMemo, useState } from "react";
import { TERMO_VERSAO } from "@/lib/termos";

type Owner = { id: string; name: string; login: string };

type Horarios = {
  turnoManha: boolean;
  turnoTarde: boolean;
  turnoNoite: boolean;
  updatedAt: string | null;
};

type Row = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  owner: Owner;
  horarios: Horarios;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    items?: Row[];
  };
};

function hasAnyTurno(h: Horarios) {
  return Boolean(h.turnoManha || h.turnoTarde || h.turnoNoite);
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "—";
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function fmtUpdatedAt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function turnosLabel(h: Horarios) {
  const out: string[] = [];
  if (h.turnoManha) out.push("Manhã");
  if (h.turnoTarde) out.push("Tarde");
  if (h.turnoNoite) out.push("Noite");
  return out;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default function HorarioBiometriaClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(
        `/api/cedentes/biometria-horarios?versao=${encodeURIComponent(TERMO_VERSAO)}&all=1`,
        { cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || "Falha ao carregar.");
      }

      const items = Array.isArray(j?.data?.items) ? j.data.items : [];
      setRows(items);
    } catch (error: unknown) {
      setRows([]);
      setErr(getErrorMessage(error, "Erro inesperado."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const available = rows.filter((r) => hasAnyTurno(r.horarios));

    const s = q.trim().toLowerCase();
    if (!s) return available;

    return available.filter((r) => {
      const t = `${r.nomeCompleto} ${r.cpf} ${r.owner?.name} ${r.owner?.login}`.toLowerCase();
      return t.includes(s);
    });
  }, [rows, q]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Horário biometria</h1>
            <div className="text-sm text-zinc-600">
              Lista apenas cedentes com <b>disponibilidade de biometria = Sim</b>, conforme
              preenchido em <b>Atualização de termos</b>.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cedente ou responsável..."
              className="h-10 w-[320px] rounded border border-zinc-300 px-3 text-sm"
            />
            <button
              onClick={load}
              className="h-10 rounded bg-zinc-900 text-white px-4 text-sm"
            >
              Atualizar
            </button>
          </div>
        </div>

        {err ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}
      </div>

      <div className="rounded border border-zinc-200 bg-white overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left">
              <th className="p-3">Cedente</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">Turnos disponíveis</th>
              <th className="p-3">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={4}>
                  Carregando...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={4}>
                  Nenhum cedente disponível para biometria.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const turnos = turnosLabel(r.horarios);
                return (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="p-3">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs text-zinc-500">{maskCpf(r.cpf)}</div>
                    </td>

                    <td className="p-3">
                      <div className="font-medium">{r.owner?.name}</div>
                      <div className="text-xs text-zinc-500">@{r.owner?.login}</div>
                    </td>

                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {turnos.map((turno) => (
                          <span
                            key={`${r.id}-${turno}`}
                            className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700"
                          >
                            {turno}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="p-3 text-xs text-zinc-500">
                      {fmtUpdatedAt(r.horarios?.updatedAt ?? null)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
