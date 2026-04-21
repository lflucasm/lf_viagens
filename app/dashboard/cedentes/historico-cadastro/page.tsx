"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type OwnerLite = { id: string; name: string; login: string };

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;

  telefone?: string | null;
  emailCriado?: string | null;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  createdAt: string;
  reviewedAt?: string | null;

  owner: OwnerLite | null;
  reviewedBy?: OwnerLite | null;

  blockedPrograms: string[];

  // ✅ flags (do endpoint /historico-cadastro)
  hasSenhaEmail?: boolean;
  hasSenhaLatamPass?: boolean;
  hasSenhaSmiles?: boolean;
  hasSenhaLivelo?: boolean;
  hasSenhaEsfera?: boolean;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function fmtInt(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return Math.trunc(v).toLocaleString("pt-BR");
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

type RevealKind = "EMAIL" | "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

const KIND_LABEL: Record<RevealKind, string> = {
  EMAIL: "Email",
  LATAM: "Latam",
  SMILES: "Smiles",
  LIVELO: "Livelo",
  ESFERA: "Esfera",
};

export default function HistoricoCadastroPage() {
  const [days, setDays] = useState(7);
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/cedentes/historico-cadastro?days=${days}`,
          { cache: "no-store" }
        );
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Falha ao carregar.");
        }

        if (alive) setRows((json.data || []) as Row[]);
      } catch (e: any) {
        if (alive) setError(e?.message || "Erro ao carregar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [days]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const fields = [
        r.nomeCompleto,
        r.identificador,
        r.cpf,
        r.owner?.name,
        r.owner?.login,
        r.emailCriado,
        r.telefone,
      ]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase());

      return fields.some((x) => x.includes(s));
    });
  }, [rows, q]);

  async function safeCopy(label: string, value?: string | null) {
    if (!value) return;
    try {
      await copyText(value);
      showToast(`${label} copiado ✅`);
    } catch {
      showToast("Falha ao copiar ❌");
    }
  }

  async function revealAndCopy(cedenteId: string, kind: RevealKind) {
    const key = `${cedenteId}:${kind}`;
    setBusyKey(key);

    try {
      const res = await fetch("/api/cedentes/reveal-credencial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ cedenteId, kind }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao revelar credencial.");
      }

      const value = String(json?.value || "");
      if (!value) throw new Error("Credencial vazia.");

      await copyText(value);
      showToast(`Senha ${KIND_LABEL[kind]} copiada ✅`);
    } catch (e: any) {
      showToast(e?.message || "Erro ao revelar credencial.");
    } finally {
      setBusyKey(null);
    }
  }

  function renderSenhaButtons(r: Row) {
    const items: { kind: RevealKind; enabled: boolean }[] = [
      { kind: "EMAIL", enabled: !!r.hasSenhaEmail },
      { kind: "LATAM", enabled: !!r.hasSenhaLatamPass },
      { kind: "SMILES", enabled: !!r.hasSenhaSmiles },
      { kind: "LIVELO", enabled: !!r.hasSenhaLivelo },
      { kind: "ESFERA", enabled: !!r.hasSenhaEsfera },
    ];

    const enabled = items.filter((x) => x.enabled);
    if (enabled.length === 0) return null;

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {enabled.map(({ kind }) => {
          const key = `${r.id}:${kind}`;
          const busy = busyKey === key;

          return (
            <button
              key={kind}
              type="button"
              disabled={!!busyKey}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg border",
                busy
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-slate-50"
              )}
              onClick={() => revealAndCopy(r.id, kind)}
              title={`Revelar e copiar senha ${KIND_LABEL[kind]}`}
            >
              {busy ? "Copiando..." : `Copiar senha ${KIND_LABEL[kind]}`}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Histórico de cadastro</h1>
          <p className="text-sm text-slate-600">
            Cedentes aprovados nos últimos <span className="font-medium">{days}</span>{" "}
            dias.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {[3, 7, 15, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-2 text-sm rounded-lg border",
                days === d ? "bg-black text-white" : "hover:bg-slate-50"
              )}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="border rounded-lg px-3 py-2 text-sm bg-white shadow-sm">
          {toast}
        </div>
      )}

      {/* Busca */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, CPF, identificador, dono, email, telefone..."
          className="w-full md:w-[560px] border rounded-lg px-3 py-2 text-sm"
        />
        <div className="text-sm text-slate-600">
          {loading ? "Carregando..." : `${filtered.length} resultado(s)`}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Tabela */}
      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="p-3">Aprovado em</th>
                <th className="p-3">Cedente</th>
                <th className="p-3">Identificador</th>
                <th className="p-3">CPF</th>
                <th className="p-3">Contato</th>
                <th className="p-3">Dono</th>
                <th className="p-3">Pontos</th>
                <th className="p-3">Bloqueios</th>
                <th className="p-3">Ações</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="p-3" colSpan={9}>
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="p-3" colSpan={9}>
                    Nenhum cedente encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const approvedAt = r.reviewedAt || r.createdAt;

                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 whitespace-nowrap">{fmtDate(approvedAt)}</td>

                      <td className="p-3">
                        <div className="font-medium">{r.nomeCompleto}</div>
                        <div className="text-xs text-slate-500">{r.id}</div>
                      </td>

                      <td className="p-3">{r.identificador}</td>

                      <td className="p-3 font-mono">{r.cpf}</td>

                      <td className="p-3">
                        <div className="text-xs text-slate-700">
                          Email:{" "}
                          {r.emailCriado ? (
                            <span className="font-medium">{r.emailCriado}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700">
                          Tel:{" "}
                          {r.telefone ? (
                            <span className="font-medium">{r.telefone}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      <td className="p-3">
                        {r.owner ? (
                          <>
                            <div className="font-medium">{r.owner.name}</div>
                            <div className="text-xs text-slate-500">{r.owner.login}</div>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="text-xs text-slate-700">
                          LATAM: <span className="font-medium">{fmtInt(r.pontosLatam)}</span>{" "}
                          • SMILES: <span className="font-medium">{fmtInt(r.pontosSmiles)}</span>
                        </div>
                        <div className="text-xs text-slate-700">
                          LIVELO: <span className="font-medium">{fmtInt(r.pontosLivelo)}</span>{" "}
                          • ESFERA: <span className="font-medium">{fmtInt(r.pontosEsfera)}</span>
                        </div>
                      </td>

                      <td className="p-3">
                        {r.blockedPrograms?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.blockedPrograms.map((p) => (
                              <span
                                key={p}
                                className="px-2 py-0.5 text-xs rounded-full border"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex flex-col gap-2">
                          {/* Copiar dados básicos */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className="px-3 py-1.5 text-xs rounded-lg border hover:bg-slate-50"
                              onClick={() => safeCopy("CPF", r.cpf)}
                            >
                              Copiar CPF
                            </button>

                            {r.emailCriado && (
                              <button
                                type="button"
                                className="px-3 py-1.5 text-xs rounded-lg border hover:bg-slate-50"
                                onClick={() => safeCopy("Email", r.emailCriado!)}
                              >
                                Copiar email
                              </button>
                            )}

                            {r.telefone && (
                              <button
                                type="button"
                                className="px-3 py-1.5 text-xs rounded-lg border hover:bg-slate-50"
                                onClick={() => safeCopy("Telefone", r.telefone!)}
                              >
                                Copiar telefone
                              </button>
                            )}

                            {r.owner?.login && (
                              <button
                                type="button"
                                className="px-3 py-1.5 text-xs rounded-lg border hover:bg-slate-50"
                                onClick={() => safeCopy("Login dono", r.owner!.login)}
                              >
                                Copiar login dono
                              </button>
                            )}
                          </div>

                          {/* Copiar senhas (reveal) */}
                          {renderSenhaButtons(r)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        * “Copiar senha” usa o endpoint <span className="font-mono">/api/cedentes/reveal-credencial</span> e copia direto para a área de transferência.
      </div>
    </div>
  );
}
