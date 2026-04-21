"use client";

import { useEffect, useMemo, useState } from "react";

type Owner = { id: string; name: string; login: string };

type TurnoKey = "turnoManha" | "turnoTarde" | "turnoNoite";
type Horarios = {
  turnoManha: boolean;
  turnoTarde: boolean;
  turnoNoite: boolean;
  updatedAt: string | null;
};

type BiometriaDisponibilidade = "YES" | "NO";

type Row = {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
  owner: Owner;
  disponibilidadeBiometria: BiometriaDisponibilidade;
  horarios: Horarios;
};

type TermsApiRow = {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
  owner: Owner;
};

type TermsResponse = {
  ok?: boolean;
  data?: TermsApiRow[];
  error?: string;
};

type BioItem = {
  id: string;
  horarios: Horarios;
};

type BioResponse = {
  ok?: boolean;
  data?: { items?: BioItem[] };
  error?: string;
};

const TURNOS: { key: TurnoKey; label: string; hint: string }[] = [
  { key: "turnoManha", label: "Manhã", hint: "07–12" },
  { key: "turnoTarde", label: "Tarde", hint: "12–18" },
  { key: "turnoNoite", label: "Noite", hint: "18–22" },
];

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function brToE164WhatsApp(raw: string | null) {
  const d = onlyDigits(raw || "");
  if (!d) return null;
  if (d.length === 13 && d.startsWith("55")) return d;
  if (d.length === 11) return `55${d}`;
  return d.length >= 10 ? (d.startsWith("55") ? d : `55${d}`) : null;
}

function hasAnyTurno(horarios: Omit<Horarios, "updatedAt"> | Horarios) {
  return Boolean(horarios.turnoManha || horarios.turnoTarde || horarios.turnoNoite);
}

function emptyHorarios(): Horarios {
  return {
    turnoManha: false,
    turnoTarde: false,
    turnoNoite: false,
    updatedAt: null,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default function AtualizacaoTermosClient({
  termoVersao,
  termoTexto,
}: {
  termoVersao: string;
  termoTexto: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const [rTerms, rBio] = await Promise.all([
        fetch(`/api/cedentes/termos?versao=${encodeURIComponent(termoVersao)}`, {
          cache: "no-store",
        }),
        fetch(
          `/api/cedentes/biometria-horarios?versao=${encodeURIComponent(
            termoVersao
          )}&all=1`,
          { cache: "no-store" }
        ),
      ]);

      const jTerms = (await rTerms.json().catch(() => ({}))) as TermsResponse;
      const jBio = (await rBio.json().catch(() => ({}))) as BioResponse;

      if (!rTerms.ok || jTerms?.ok === false) {
        throw new Error(jTerms?.error || "Falha ao carregar cedentes.");
      }
      if (!rBio.ok || jBio?.ok === false) {
        throw new Error(jBio?.error || "Falha ao carregar horários de biometria.");
      }

      const bioItems = Array.isArray(jBio?.data?.items) ? jBio.data.items : [];
      const bioMap = new Map<string, Horarios>(
        bioItems.map((item) => [item.id, item.horarios || emptyHorarios()])
      );

      const termRows = Array.isArray(jTerms?.data) ? jTerms.data : [];
      const mergedRows: Row[] = termRows.map((item) => {
        const horarios = bioMap.get(item.id) || emptyHorarios();
        return {
          id: item.id,
          nomeCompleto: item.nomeCompleto,
          telefone: item.telefone,
          owner: item.owner,
          horarios,
          disponibilidadeBiometria: hasAnyTurno(horarios) ? "YES" : "NO",
        };
      });

      setRows(mergedRows);
    } catch (error: unknown) {
      setErr(getErrorMessage(error, "Erro inesperado."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termoVersao]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        r.nomeCompleto.toLowerCase().includes(s) ||
        r.owner?.name?.toLowerCase().includes(s) ||
        r.owner?.login?.toLowerCase().includes(s)
      );
    });
  }, [rows, q]);

  async function saveBiometria(
    cedenteId: string,
    disponibilidadeBiometria: BiometriaDisponibilidade,
    horarios: Omit<Horarios, "updatedAt"> | Horarios
  ) {
    setSavingId(cedenteId);

    const shouldEnable = disponibilidadeBiometria === "YES";
    const normalized = shouldEnable
      ? {
          turnoManha: Boolean(horarios.turnoManha),
          turnoTarde: Boolean(horarios.turnoTarde),
          turnoNoite: Boolean(horarios.turnoNoite),
        }
      : {
          turnoManha: false,
          turnoTarde: false,
          turnoNoite: false,
        };

    if (shouldEnable && !hasAnyTurno(normalized)) {
      alert("Se disponibilidade for 'Sim', selecione pelo menos um turno.");
      setSavingId(null);
      return;
    }

    try {
      const res = await fetch("/api/cedentes/biometria-horarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId, ...normalized }),
      });

      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: { horarios?: Horarios };
      };

      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || "Falha ao salvar disponibilidade de biometria.");
      }

      const savedHorarios: Horarios = j?.data?.horarios || {
        ...normalized,
        updatedAt: new Date().toISOString(),
      };

      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== cedenteId) return r;
          return {
            ...r,
            horarios: savedHorarios,
            disponibilidadeBiometria: hasAnyTurno(savedHorarios) ? "YES" : "NO",
          };
        })
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Falha ao salvar disponibilidade de biometria."));
    } finally {
      setSavingId(null);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function makeWhatsAppUrl(row: Row) {
    const e164 = brToE164WhatsApp(row.telefone);
    if (!e164) return null;
    return `https://wa.me/${e164}?text=${encodeURIComponent(termoTexto)}`;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">Atualização de termos • Biometria</h1>

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

        <div className="rounded border border-zinc-200 p-3 bg-white">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-zinc-700">
              <b>Versão do termo:</b> {termoVersao}
            </div>
            <button
              className="h-9 rounded border border-zinc-300 px-3 text-sm"
              onClick={() => copyText(termoTexto)}
            >
              Copiar termo
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="rounded border border-zinc-200 bg-white overflow-x-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left">
              <th className="p-3">Cedente</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">WhatsApp</th>
              <th className="p-3">Disponibilidade de biometria?</th>
              <th className="p-3">Turnos</th>
              <th className="p-3">Atualizado</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={6}>
                  Carregando...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={6}>
                  Nenhum cedente encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const wa = makeWhatsAppUrl(r);
                const saving = savingId === r.id;

                return (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="p-3">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs text-zinc-500">{r.id}</div>
                    </td>

                    <td className="p-3">
                      <div className="font-medium">{r.owner?.name}</div>
                      <div className="text-xs text-zinc-500">@{r.owner?.login}</div>
                    </td>

                    <td className="p-3">
                      {wa ? (
                        <div className="flex flex-col gap-2">
                          <a
                            className="inline-flex items-center justify-center h-9 rounded bg-zinc-900 text-white px-3 text-sm"
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Enviar termo
                          </a>
                          <button
                            className="h-9 rounded border border-zinc-300 px-3 text-sm"
                            onClick={() => copyText(wa)}
                          >
                            Copiar link
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-400">Sem telefone</span>
                      )}
                    </td>

                    <td className="p-3">
                      <select
                        className="h-9 rounded border border-zinc-300 px-2"
                        value={r.disponibilidadeBiometria}
                        disabled={saving}
                        onChange={(e) => {
                          const next = e.target.value as BiometriaDisponibilidade;

                          if (next === "YES") {
                            const hasAny = hasAnyTurno(r.horarios);
                            const horarios = hasAny
                              ? r.horarios
                              : {
                                  ...r.horarios,
                                  turnoManha: true,
                                  turnoTarde: false,
                                  turnoNoite: false,
                                };
                            void saveBiometria(r.id, "YES", horarios);
                            return;
                          }

                          void saveBiometria(r.id, "NO", {
                            turnoManha: false,
                            turnoTarde: false,
                            turnoNoite: false,
                            updatedAt: null,
                          });
                        }}
                      >
                        <option value="YES">Sim</option>
                        <option value="NO">Não</option>
                      </select>
                    </td>

                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        {TURNOS.map((t) => (
                          <label key={t.key} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={Boolean(r.horarios[t.key])}
                              disabled={saving || r.disponibilidadeBiometria !== "YES"}
                              onChange={(e) => {
                                const nextHorarios = {
                                  ...r.horarios,
                                  [t.key]: e.target.checked,
                                };
                                const nextDisp: BiometriaDisponibilidade = hasAnyTurno(nextHorarios)
                                  ? "YES"
                                  : "NO";

                                void saveBiometria(r.id, nextDisp, nextHorarios);
                              }}
                            />
                            <span>{t.label}</span>
                            <span className="text-xs text-zinc-500">({t.hint})</span>
                          </label>
                        ))}

                        {r.disponibilidadeBiometria === "NO" ? (
                          <span className="text-xs text-zinc-500">
                            Marque <b>Sim</b> para escolher os turnos.
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="p-3">
                      {saving ? (
                        <span className="text-xs text-zinc-500">Salvando...</span>
                      ) : r.horarios.updatedAt ? (
                        <span className="text-xs text-zinc-500">
                          {new Date(r.horarios.updatedAt).toLocaleString("pt-BR")}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">Sem registro</span>
                      )}
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
