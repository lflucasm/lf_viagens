"use client";

import { useEffect, useMemo, useState } from "react";

type TurboStatus = "PENDING" | "TRANSFERRED" | "SKIPPED";
type ClubStatus = "ACTIVE" | "PAUSED" | "CANCELED";

type Row = {
  cedente: { id: string; identificador: string; nomeCompleto: string; cpf: string };

  club: null | {
    id: string;
    status: ClubStatus;
    tierK: number;
    subscribedAt: string;
    renewalDay: number;
    lastRenewedAt: string | null;
    pointsExpireAt: string | null;
  };

  auto: null | {
    nextRenewalAt: string;
    inactiveAt: string;
    cancelAt: string;
    inactiveInMonth: boolean;
    cancelInMonth: boolean;
  };

  account: { cpfLimit: number; cpfUsed: number; cpfFree: number };

  turbo: null | {
    id: string;
    status: TurboStatus;
    points: number;
    notes: string | null;
    updatedAt: string;
  };

  buckets: {
    isActiveBucket: boolean;
    isInactiveBucket: boolean;
    isCancelBucket: boolean;
    canSubscribe: boolean;
  };
};

type ApiResp = {
  ok: true;
  monthKey: string;
  limitPoints: number;
  usedPoints: number;
  remainingPoints: number;
  lists: {
    active: Row[];
    inactive: Row[];
    cancelThisMonth: Row[];
    canSubscribe: Row[];
  };
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function dateBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function pillClass(s: TurboStatus) {
  if (s === "TRANSFERRED") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "SKIPPED") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

/**
 * PRIORIDADE (para aparecer em cima):
 *  0) inativa no mês + em aguardo
 *  1) em aguardo
 *  2) resto
 *  Empate: ordem alfabética
 */
function rowStatus(r: Row): TurboStatus {
  return r.turbo?.status || "PENDING";
}
function rowPriority(r: Row) {
  const st = rowStatus(r);
  if (st !== "PENDING") return 2;
  if (r.auto?.inactiveInMonth) return 0;
  return 1;
}
function rowAlphaKey(r: Row) {
  return (r.cedente.nomeCompleto || r.cedente.identificador || "").trim();
}
function compareRowsByPriority(a: Row, b: Row) {
  const pa = rowPriority(a);
  const pb = rowPriority(b);
  if (pa !== pb) return pa - pb;

  return rowAlphaKey(a).localeCompare(rowAlphaKey(b), "pt-BR", { sensitivity: "base" });
}

async function postTurbo(payload: any) {
  const r = await fetch("/api/latam/turbo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Falha ao salvar turbo");
  return j.item;
}

async function postAccount(payload: any) {
  const r = await fetch("/api/latam/turbo/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Falha ao salvar CPFs");
  return j.item;
}

function Section({
  title,
  rows,
  monthKey,
  onChange,
  showClub = true,
  showCancelBadge = false,
}: {
  title: string;
  rows: Row[];
  monthKey: string;
  onChange: (cedenteId: string, patch: Partial<{ status: TurboStatus; points: number }>) => void;
  showClub?: boolean;
  showCancelBadge?: boolean;
}) {
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort(compareRowsByPriority);
    return copy;
  }, [rows]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-neutral-500">{sortedRows.length} contas</div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-2 pr-3">Identificador</th>
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">CPF</th>

              {showClub ? (
                <>
                  <th className="py-2 pr-3">Clube LATAM</th>
                  <th className="py-2 pr-3">Inativa em</th>
                  <th className="py-2 pr-3">Cancela em</th>
                </>
              ) : null}

              <th className="py-2 pr-3">CPFs livres</th>
              <th className="py-2 pr-3">Pontos (mês)</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((r) => {
              const status: TurboStatus = r.turbo?.status || "PENDING";
              const points = r.turbo?.points || 0;

              return (
                <tr key={r.cedente.id} className="border-t">
                  <td className="py-2 pr-3 font-medium">{r.cedente.identificador}</td>
                  <td className="py-2 pr-3">{r.cedente.nomeCompleto}</td>
                  <td className="py-2 pr-3">{r.cedente.cpf}</td>

                  {showClub ? (
                    <>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border px-2 py-0.5 text-xs">
                            {r.club?.status || "—"}
                          </span>

                          {showCancelBadge && r.auto?.cancelInMonth ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                              cancela no mês
                            </span>
                          ) : null}

                          {!showCancelBadge && r.auto?.inactiveInMonth ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                              inativa no mês
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{dateBR(r.auto?.inactiveAt)}</td>
                      <td className="py-2 pr-3">{dateBR(r.auto?.cancelAt)}</td>
                    </>
                  ) : null}

                  <td className="py-2 pr-3">
                    <span className="rounded-full border px-2 py-0.5 text-xs">{r.account.cpfFree}</span>
                  </td>

                  <td className="py-2 pr-3">
                    <input
                      className="w-36 rounded-xl border px-3 py-1.5 text-sm outline-none"
                      value={String(points)}
                      inputMode="numeric"
                      onChange={(e) => {
                        const v = Math.max(0, Math.trunc(Number(e.target.value || 0) || 0));
                        onChange(r.cedente.id, { points: v });
                      }}
                    />
                    <div className="mt-1 text-[11px] text-neutral-500">ref: {monthKey}</div>
                  </td>

                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs ${pillClass(
                        status
                      )}`}
                    >
                      {status === "TRANSFERRED"
                        ? "transferido"
                        : status === "SKIPPED"
                        ? "não transferir"
                        : "em aguardo"}
                    </span>
                  </td>

                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <button
                        className="rounded-xl border px-3 py-1.5 text-xs hover:bg-neutral-50"
                        onClick={() => onChange(r.cedente.id, { status: "PENDING" })}
                      >
                        Aguardo
                      </button>
                      <button
                        className="rounded-xl border px-3 py-1.5 text-xs hover:bg-neutral-50"
                        onClick={() => onChange(r.cedente.id, { status: "TRANSFERRED" })}
                      >
                        Verde
                      </button>
                      <button
                        className="rounded-xl border px-3 py-1.5 text-xs hover:bg-neutral-50"
                        onClick={() => onChange(r.cedente.id, { status: "SKIPPED" })}
                      >
                        Vermelho
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-sm text-neutral-500">
                  Sem resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LatamTurboPage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyRelevant, setOnlyRelevant] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (onlyRelevant) params.set("onlyRelevant", "1");

      const r = await fetch(`/api/latam/turbo?${params.toString()}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Falha ao carregar");
      setData(j);
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyRelevant]);

  const monthKey = data?.monthKey || "—";

  const totalPlanned = data?.usedPoints || 0;
  const remaining = data?.remainingPoints || 0;
  const limit = data?.limitPoints || 100_000;

  const canSubscribeSorted = useMemo(() => {
    if (!data) return [];
    return data.lists.canSubscribe;
  }, [data]);

  async function applyChange(
    cedenteId: string,
    patch: Partial<{ status: TurboStatus; points: number }>
  ) {
    if (!data) return;

    const mutateLists = (rows: Row[]) =>
      rows.map((r) => {
        if (r.cedente.id !== cedenteId) return r;
        const cur =
          r.turbo || {
            id: "",
            status: "PENDING" as TurboStatus,
            points: 0,
            notes: null,
            updatedAt: new Date().toISOString(),
          };
        const next = {
          ...cur,
          status: (patch.status ?? cur.status) as TurboStatus,
          points: typeof patch.points === "number" ? patch.points : cur.points,
          updatedAt: new Date().toISOString(),
        };
        return { ...r, turbo: next };
      });

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: {
          active: mutateLists(prev.lists.active),
          inactive: mutateLists(prev.lists.inactive),
          cancelThisMonth: mutateLists(prev.lists.cancelThisMonth),
          canSubscribe: mutateLists(prev.lists.canSubscribe),
        },
      };
    });

    try {
      await postTurbo({
        cedenteId,
        monthKey,
        ...(patch.status ? { status: patch.status } : {}),
        ...(typeof patch.points === "number" ? { points: patch.points } : {}),
      });

      await load();
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar");
      await load();
    }
  }

  async function saveCpf(cedenteId: string, cpfLimit: number, cpfUsed: number) {
    try {
      await postAccount({ cedenteId, cpfLimit, cpfUsed });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar CPFs");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-neutral-600">Carregando…</div>;
  }
  if (err) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-4 text-sm text-rose-700">{err}</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold">LATAM Turbo</div>
          <div className="text-sm text-neutral-500">
            Mês:{" "}
            <span className="font-medium text-neutral-700">{monthKey}</span> • Limite:{" "}
            {fmtInt(limit)} • Planejado: {fmtInt(totalPlanned)} • Restante:{" "}
            {fmtInt(remaining)}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            className="w-full md:w-80 rounded-2xl border bg-white px-4 py-2 text-sm outline-none"
            placeholder="Buscar cedente (nome / identificador / cpf)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load();
            }}
          />
          <button
            className="rounded-2xl border bg-white px-4 py-2 text-sm hover:bg-neutral-50"
            onClick={load}
          >
            Buscar
          </button>

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={onlyRelevant}
              onChange={(e) => setOnlyRelevant(e.target.checked)}
            />
            Somente relevantes do mês
          </label>
        </div>
      </div>

      <div className="grid gap-4">
        <Section
          title="Ativos (inclui “inativa no mês” se não cancelar no mês)"
          rows={data.lists.active}
          monthKey={monthKey}
          onChange={applyChange}
          showCancelBadge={false}
        />

        <Section
          title="Inativos (PAUSED)"
          rows={data.lists.inactive}
          monthKey={monthKey}
          onChange={applyChange}
          showCancelBadge={false}
        />

        <Section
          title="Cancelam no mês"
          rows={data.lists.cancelThisMonth}
          monthKey={monthKey}
          onChange={applyChange}
          showCancelBadge={true}
        />

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              Posso assinar clube (CANCELED ou sem assinatura) • CPFs livres &gt; 5
            </div>
            <div className="text-xs text-neutral-500">{canSubscribeSorted.length} contas</div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-2 pr-3">Identificador</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">CPF</th>
                  <th className="py-2 pr-3">CPFs livres</th>
                  <th className="py-2 pr-3">Limite</th>
                  <th className="py-2 pr-3">Usados</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {canSubscribeSorted.map((r) => (
                  <tr key={r.cedente.id} className="border-t">
                    <td className="py-2 pr-3 font-medium">{r.cedente.identificador}</td>
                    <td className="py-2 pr-3">{r.cedente.nomeCompleto}</td>
                    <td className="py-2 pr-3">{r.cedente.cpf}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {r.account.cpfFree}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-24 rounded-xl border px-3 py-1.5 text-sm outline-none"
                        defaultValue={String(r.account.cpfLimit)}
                        onBlur={(e) => {
                          const v = Math.max(0, Math.trunc(Number(e.target.value || 0) || 0));
                          saveCpf(r.cedente.id, v, r.account.cpfUsed);
                        }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-24 rounded-xl border px-3 py-1.5 text-sm outline-none"
                        defaultValue={String(r.account.cpfUsed)}
                        onBlur={(e) => {
                          const v = Math.max(0, Math.trunc(Number(e.target.value || 0) || 0));
                          saveCpf(r.cedente.id, r.account.cpfLimit, v);
                        }}
                      />
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">(edite e clique fora)</td>
                  </tr>
                ))}

                {canSubscribeSorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-sm text-neutral-500">
                      Nenhuma conta elegível (&gt; 5 CPFs livres).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
