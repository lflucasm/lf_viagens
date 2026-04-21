"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rapidezBiometria: number;
  rapidezSms: number;
  resolucaoProblema: number;
  confianca: number;
  media: number;
  updatedAt: string | null;
};

type Draft = {
  rapidezBiometria: string;
  rapidezSms: string;
  resolucaoProblema: string;
  confianca: string;
};

function clampScore(n: number) {
  return Math.max(0, Math.min(10, n));
}

function parseScore(raw: string) {
  const s = String(raw || "").replace(",", ".").trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(clampScore(n) * 10) / 10;
}

function avg(d: Draft) {
  const a = parseScore(d.rapidezBiometria) ?? 0;
  const b = parseScore(d.rapidezSms) ?? 0;
  const c = parseScore(d.resolucaoProblema) ?? 0;
  const e = parseScore(d.confianca) ?? 0;
  return Math.round(((a + b + c + e) / 4) * 100) / 100;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export default function ScoreCedentesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cedentes/score", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar score dos cedentes.");
      }
      const nextRows = (json.rows || []) as Row[];
      setRows(nextRows);

      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of nextRows) {
          next[r.id] = {
            rapidezBiometria: String(r.rapidezBiometria ?? 0),
            rapidezSms: String(r.rapidezSms ?? 0),
            resolucaoProblema: String(r.resolucaoProblema ?? 0),
            confianca: String(r.confianca ?? 0),
          };
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const hay =
        `${r.identificador} ${r.nomeCompleto} ${r.status}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  function setDraftField(id: string, key: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {
          rapidezBiometria: "0",
          rapidezSms: "0",
          resolucaoProblema: "0",
          confianca: "0",
        }),
        [key]: value,
      },
    }));
  }

  async function saveRow(id: string) {
    const d = drafts[id];
    if (!d) return;

    const rapidezBiometria = parseScore(d.rapidezBiometria);
    const rapidezSms = parseScore(d.rapidezSms);
    const resolucaoProblema = parseScore(d.resolucaoProblema);
    const confianca = parseScore(d.confianca);

    if (
      rapidezBiometria == null ||
      rapidezSms == null ||
      resolucaoProblema == null ||
      confianca == null
    ) {
      alert("As notas devem ser números entre 0 e 10.");
      return;
    }

    setSavingId(id);
    try {
      const res = await fetch("/api/cedentes/score", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId: id,
          rapidezBiometria,
          rapidezSms,
          resolucaoProblema,
          confianca,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar.");
      }

      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          return {
            ...r,
            rapidezBiometria: Number(json.row?.rapidezBiometria ?? r.rapidezBiometria),
            rapidezSms: Number(json.row?.rapidezSms ?? r.rapidezSms),
            resolucaoProblema: Number(
              json.row?.resolucaoProblema ?? r.resolucaoProblema
            ),
            confianca: Number(json.row?.confianca ?? r.confianca),
            media: Number(json.row?.media ?? r.media),
            updatedAt: json.row?.updatedAt || r.updatedAt,
          };
        })
      );
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar score.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Score Cedentes</h1>
          <p className="text-sm text-slate-600">
            Notas de 0 a 10 para Rapidez Biometria, Rapidez SMS, Resolução de
            problemas e Confiança. A média é calculada automaticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, identificador..."
            className="w-full sm:w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={load}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-xl border">
        {loading ? (
          <div className="p-4 text-sm">Carregando...</div>
        ) : error ? (
          <div className="p-4 text-sm text-rose-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">Nenhum cedente encontrado.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Cedente</th>
                  <th className="px-3 py-2 text-left">Rapidez Biometria</th>
                  <th className="px-3 py-2 text-left">Rapidez SMS</th>
                  <th className="px-3 py-2 text-left">Resolução problemas</th>
                  <th className="px-3 py-2 text-left">Confiança</th>
                  <th className="px-3 py-2 text-left">Média</th>
                  <th className="px-3 py-2 text-left">Atualizado</th>
                  <th className="px-3 py-2 text-left">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const d =
                    drafts[r.id] || {
                      rapidezBiometria: "0",
                      rapidezSms: "0",
                      resolucaoProblema: "0",
                      confianca: "0",
                    };
                  const mediaDraft = avg(d);
                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.nomeCompleto}</div>
                        <div className="text-xs text-slate-500">
                          {r.identificador} • {r.status}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={d.rapidezBiometria}
                          onChange={(e) =>
                            setDraftField(r.id, "rapidezBiometria", e.target.value)
                          }
                          className="w-24 rounded-md border px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={d.rapidezSms}
                          onChange={(e) =>
                            setDraftField(r.id, "rapidezSms", e.target.value)
                          }
                          className="w-24 rounded-md border px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={d.resolucaoProblema}
                          onChange={(e) =>
                            setDraftField(r.id, "resolucaoProblema", e.target.value)
                          }
                          className="w-24 rounded-md border px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={d.confianca}
                          onChange={(e) =>
                            setDraftField(r.id, "confianca", e.target.value)
                          }
                          className="w-24 rounded-md border px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {mediaDraft.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {fmtDate(r.updatedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => saveRow(r.id)}
                          disabled={savingId === r.id}
                          className="rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-60"
                        >
                          {savingId === r.id ? "Salvando..." : "Salvar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
