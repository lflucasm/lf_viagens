"use client";

import { useEffect, useMemo, useState } from "react";

type CedenteOpt = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  identificador: string;

  // ✅ pontos para preview
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

type Observation = { id: string; text: string; createdAt: string };

type BlockRow = {
  id: string;
  status: "OPEN" | "UNBLOCKED" | "CANCELED";
  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  note?: string | null;
  estimatedUnlockAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  pointsBlocked: number;
  valueBlockedCents: number;
  observations: Observation[];
};

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function dateTimeBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}
function dateBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

// diferença em dias (inteiro) entre hoje e uma data (ISO)
function daysUntil(iso: string) {
  const target = new Date(iso);
  const now = new Date();

  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d0 = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();

  return Math.round((d0 - t0) / (1000 * 60 * 60 * 24));
}

function statusBadge(b: BlockRow) {
  // se já finalizou
  if (b.status === "UNBLOCKED") {
    return {
      label: "Desbloqueado",
      cls: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  }
  if (b.status === "CANCELED") {
    return {
      label: "Cancelado",
      cls: "bg-slate-50 border-slate-200 text-slate-700",
    };
  }

  // OPEN:
  if (!b.estimatedUnlockAt) {
    return {
      label: "Em aberto",
      cls: "bg-yellow-50 border-yellow-200 text-yellow-800",
    };
  }

  const d = daysUntil(b.estimatedUnlockAt);

  // chegou no dia ou passou
  if (d <= 0) {
    return {
      label: "Dia do desbloqueio",
      cls: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  }

  // faltando até 7 dias
  if (d <= 7) {
    return {
      label: `Faltam ${d} dia(s)`,
      cls: "bg-blue-50 border-blue-200 text-blue-700",
    };
  }

  // normal
  return {
    label: "Em aberto",
    cls: "bg-yellow-50 border-yellow-200 text-yellow-800",
  };
}

export default function BloqueiosClient() {
  const [loading, setLoading] = useState(false);

  const [cedentes, setCedentes] = useState<CedenteOpt[]>([]);
  const [rows, setRows] = useState<BlockRow[]>([]);

  const [cedenteId, setCedenteId] = useState("");
  const [program, setProgram] = useState<BlockRow["program"]>("LATAM");
  const [note, setNote] = useState("");
  const [estimatedUnlockAt, setEstimatedUnlockAt] = useState(""); // yyyy-mm-dd

  const [obsText, setObsText] = useState<Record<string, string>>({});

  async function loadAll() {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/cedentes/options", { cache: "no-store" }),
        fetch("/api/bloqueios", { cache: "no-store" }),
      ]);

      const j1 = await r1.json();
      const j2 = await r2.json();

      if (!j1?.ok) throw new Error(j1?.error || "Erro ao carregar contas");
      if (!j2?.ok) throw new Error(j2?.error || "Erro ao carregar bloqueios");

      setCedentes(j1.data || []);
      setRows(j2.data.rows || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ✅ Cedente selecionado + preview dos 4 programas
  const selectedCedente = useMemo(() => {
    return cedentes.find((c) => c.id === cedenteId) || null;
  }, [cedentes, cedenteId]);

  const preview = useMemo(() => {
    if (!selectedCedente) return { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    return {
      latam: selectedCedente.pontosLatam || 0,
      smiles: selectedCedente.pontosSmiles || 0,
      livelo: selectedCedente.pontosLivelo || 0,
      esfera: selectedCedente.pontosEsfera || 0,
    };
  }, [selectedCedente]);

  const totals = useMemo(() => {
    const open = rows.filter((r) => r.status === "OPEN");
    const points = open.reduce((a, r) => a + (r.pointsBlocked || 0), 0);
    const value = open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0);
    return { openCount: open.length, pointsBlocked: points, valueBlockedCents: value };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const rankStatus = (status: BlockRow["status"]) => {
      if (status === "OPEN") return 0;
      if (status === "CANCELED") return 1;
      return 2; // UNBLOCKED sempre no final
    };

    return [...rows].sort((a, b) => {
      const statusDiff = rankStatus(a.status) - rankStatus(b.status);
      if (statusDiff !== 0) return statusDiff;

      if (a.status === "OPEN" && b.status === "OPEN") {
        const aHasUnlock = !!a.estimatedUnlockAt;
        const bHasUnlock = !!b.estimatedUnlockAt;
        if (aHasUnlock !== bHasUnlock) return aHasUnlock ? -1 : 1;

        if (aHasUnlock && bHasUnlock) {
          const aUnlock = new Date(a.estimatedUnlockAt as string).getTime();
          const bUnlock = new Date(b.estimatedUnlockAt as string).getTime();
          if (aUnlock !== bUnlock) return aUnlock - bUnlock; // mais próximo primeiro
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      if (a.status === "UNBLOCKED" && b.status === "UNBLOCKED") {
        const aResolved = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
        const bResolved = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
        if (aResolved !== bResolved) return bResolved - aResolved;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [rows]);

  async function createBlock() {
    if (!cedenteId) return alert("Selecione a conta (cedente).");

    setLoading(true);
    try {
      const res = await fetch("/api/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId,
          program,
          note,
          estimatedUnlockAt: estimatedUnlockAt ? `${estimatedUnlockAt}T00:00:00.000Z` : null,
        }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao criar bloqueio");

      setCedenteId("");
      setProgram("LATAM");
      setNote("");
      setEstimatedUnlockAt("");
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addObs(blockId: string) {
    const text = (obsText[blockId] || "").trim();
    if (!text) return alert("Digite a observação/protocolo.");

    setLoading(true);
    try {
      const res = await fetch(`/api/bloqueios/${blockId}/observacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao adicionar observação");

      setObsText((p) => ({ ...p, [blockId]: "" }));
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ✅ desbloqueio manual (não automático)
  async function markUnblocked(blockId: string) {
    if (!confirm("Marcar este bloqueio como DESBLOQUEADO?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/bloqueios/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "UNBLOCKED" }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Erro ao atualizar status.");

      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contas bloqueadas</h1>
          <p className="text-sm text-slate-600">
            Registre bloqueios por programa, acompanhe protocolos e veja o valor total bloqueado (milheiros do Resumo).
          </p>
        </div>

        <button
          onClick={loadAll}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Bloqueios em aberto</div>
          <div className="text-xl font-bold">{totals.openCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">Pontos bloqueados (soma)</div>
          <div className="text-xl font-bold">{fmtInt(totals.pointsBlocked)}</div>
        </div>
        <div className="rounded-2xl border bg-black p-4 text-white">
          <div className="text-xs opacity-80">Valor bloqueado (R$)</div>
          <div className="text-2xl font-bold">{fmtMoney(totals.valueBlockedCents)}</div>
        </div>
      </div>

      {/* Criar bloqueio */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Adicionar bloqueio</div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-slate-600">Conta (Cedente)</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={cedenteId}
              onChange={(e) => setCedenteId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {cedentes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto} • {c.identificador}
                </option>
              ))}
            </select>

            {/* ✅ PREVIEW dos pontos das 4 CIAs */}
            {selectedCedente && (
              <div className="mt-2 rounded-xl border bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Prévia de pontos (todas as CIAs)
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className={cn("rounded-lg border bg-white p-2", program === "LATAM" && "border-black")}>
                    <div className="text-[11px] text-slate-600">LATAM</div>
                    <div className="font-semibold tabular-nums">{fmtInt(preview.latam)}</div>
                  </div>

                  <div className={cn("rounded-lg border bg-white p-2", program === "SMILES" && "border-black")}>
                    <div className="text-[11px] text-slate-600">SMILES</div>
                    <div className="font-semibold tabular-nums">{fmtInt(preview.smiles)}</div>
                  </div>

                  <div className={cn("rounded-lg border bg-white p-2", program === "LIVELO" && "border-black")}>
                    <div className="text-[11px] text-slate-600">LIVELO</div>
                    <div className="font-semibold tabular-nums">{fmtInt(preview.livelo)}</div>
                  </div>

                  <div className={cn("rounded-lg border bg-white p-2", program === "ESFERA" && "border-black")}>
                    <div className="text-[11px] text-slate-600">ESFERA</div>
                    <div className="font-semibold tabular-nums">{fmtInt(preview.esfera)}</div>
                  </div>
                </div>

                <div className="mt-2 text-xs text-slate-600">
                  * Ao clicar em <b>Adicionar</b>, será bloqueado somente o programa selecionado acima.
                </div>
              </div>
            )}
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Programa</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={program}
              onChange={(e) => setProgram(e.target.value as any)}
            >
              <option value="LATAM">LATAM</option>
              <option value="SMILES">Smiles</option>
              <option value="LIVELO">Livelo</option>
              <option value="ESFERA">Esfera</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Previsão desbloqueio</div>
            <input
              type="date"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={estimatedUnlockAt}
              onChange={(e) => setEstimatedUnlockAt(e.target.value)}
            />
          </label>

          <label className="space-y-1 md:col-span-4">
            <div className="text-xs text-slate-600">Observação inicial</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: bloqueada após transferência, solicitada análise, etc."
            />
          </label>
        </div>

        <button
          onClick={createBlock}
          className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
          disabled={loading}
        >
          Adicionar
        </button>
      </div>

      {/* Lista */}
      {rows.length === 0 ? (
        <div className="text-sm text-slate-600">Nenhum bloqueio cadastrado ainda.</div>
      ) : (
        <div className="space-y-4">
          {sortedRows.map((b) => {
            const badge = statusBadge(b);

            return (
              <div key={b.id} className="rounded-2xl border bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold flex flex-wrap items-center gap-2">
                      <span>
                        {b.cedente.nomeCompleto} • {b.program}
                      </span>

                      <span className={cn("text-xs px-2 py-1 rounded-full border", badge.cls)}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500">
                      {b.cedente.identificador} • Criado em {dateTimeBR(b.createdAt)}
                      {b.estimatedUnlockAt ? ` • Previsão: ${dateBR(b.estimatedUnlockAt)}` : ""}
                      {b.resolvedAt ? ` • Resolvido: ${dateBR(b.resolvedAt)}` : ""}
                    </div>

                    {b.note ? <div className="text-sm text-slate-700 mt-1">{b.note}</div> : null}
                  </div>

                  <div className="text-right space-y-2">
                    <div>
                      <div className="text-xs text-slate-600">Bloqueado</div>
                      <div className="font-semibold">{fmtInt(b.pointsBlocked)} pts</div>
                      <div className="text-sm font-semibold">{fmtMoney(b.valueBlockedCents)}</div>
                    </div>

                    {/* ✅ Botão manual */}
                    {b.status === "OPEN" && (
                      <button
                        onClick={() => markUnblocked(b.id)}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-white text-sm hover:bg-emerald-700"
                        disabled={loading}
                        title="Marcar como desbloqueado (manual)"
                      >
                        Marcar como desbloqueado
                      </button>
                    )}
                  </div>
                </div>

                {/* Add obs */}
                {b.status === "OPEN" && (
                  <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
                    <div className="text-sm font-semibold">Adicionar observação / protocolo</div>
                    <div className="grid gap-2 md:grid-cols-4">
                      <input
                        className="md:col-span-3 rounded-xl border px-3 py-2 text-sm"
                        placeholder="Ex: protocolo 12345, resposta da CIA, reenvio documentos..."
                        value={obsText[b.id] ?? ""}
                        onChange={(e) => setObsText((p) => ({ ...p, [b.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => addObs(b.id)}
                        className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
                        disabled={loading}
                      >
                        Registrar
                      </button>
                    </div>
                  </div>
                )}

                {/* Histórico */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Histórico</div>
                  {b.observations.length === 0 ? (
                    <div className="text-sm text-slate-600">Nenhuma atualização registrada.</div>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded-xl border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Data/hora</th>
                            <th className="px-3 py-2 text-left">Observação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.observations.map((o) => (
                            <tr key={o.id} className="border-t">
                              <td className="px-3 py-2 whitespace-nowrap">{dateTimeBR(o.createdAt)}</td>
                              <td className="px-3 py-2">{o.text}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
