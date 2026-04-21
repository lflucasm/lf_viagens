"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Status = "ACTIVE" | "PAUSED" | "CANCELED";

type Item = {
  id: string;
  cedenteId: string;
  status: Status;
  tierK: number;
  renewalDay: number;
  monthlyBonusPoints: number;
  subscribedAt: string;
  lastRenewedAt: string | null;
  updatedAt: string;
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    owner: {
      id: string;
      name: string;
      login: string;
    };
  };
};

type Draft = {
  renewalDay: string;
  monthlyBonusPoints: string;
};

function fmtInt(v: number) {
  return new Intl.NumberFormat("pt-BR").format(v || 0);
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function statusClass(status: Status) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PAUSED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function statusLabel(status: Status) {
  if (status === "ACTIVE") return "ATIVO";
  if (status === "PAUSED") return "PAUSADO";
  return "CANCELADO";
}

function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}

export default function LiveloBonusClubeClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contas-selecionadas/livelo/bonus-clube", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar bônus clube Livelo.");
      }

      const rows = (json.items || []) as Item[];
      setItems(rows);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          next[r.id] = {
            renewalDay: String(r.renewalDay ?? 1),
            monthlyBonusPoints: String(r.monthlyBonusPoints ?? 0),
          };
        }
        return next;
      });
    } catch (e: any) {
      setItems([]);
      setError(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((r) => {
      const hay =
        `${r.cedente.nomeCompleto} ${r.cedente.identificador} ${r.cedente.cpf} ${r.cedente.owner.name} ${r.cedente.owner.login}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q]);

  const totals = useMemo(() => {
    const totalClubes = filtered.length;
    const totalBonusMes = filtered.reduce(
      (acc, r) => acc + Number(r.monthlyBonusPoints || 0),
      0
    );
    return { totalClubes, totalBonusMes };
  }, [filtered]);

  function setDraftField(id: string, key: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { renewalDay: "1", monthlyBonusPoints: "0" }),
        [key]: value,
      },
    }));
  }

  async function saveRow(id: string) {
    const d = drafts[id];
    if (!d) return;

    const renewalDay = Number(onlyDigits(d.renewalDay || ""));
    const monthlyBonusPoints = Number(onlyDigits(d.monthlyBonusPoints || ""));

    if (!Number.isFinite(renewalDay) || renewalDay < 1 || renewalDay > 31) {
      alert("Dia de renovação deve ser entre 1 e 31.");
      return;
    }

    if (!Number.isFinite(monthlyBonusPoints) || monthlyBonusPoints < 0) {
      alert("Bônus mensal deve ser um número maior ou igual a 0.");
      return;
    }

    setSavingId(id);
    try {
      const res = await fetch("/api/contas-selecionadas/livelo/bonus-clube", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          renewalDay,
          monthlyBonusPoints,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar.");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar registro.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bônus clube Livelo</h1>
          <p className="text-sm text-slate-500">
            Clubes Livelo cadastrados com edição de dia de renovação e bônus mensal de pontos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="border rounded-lg px-4 py-2 text-sm hover:bg-slate-50"
            type="button"
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          <Link
            href="/dashboard/clubes/cadastrar"
            className="border rounded-lg px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cadastrar clube
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Clubes Livelo listados</div>
          <div className="mt-1 text-xl font-semibold">{fmtInt(totals.totalClubes)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Bônus mensal total</div>
          <div className="mt-1 text-xl font-semibold">{fmtInt(totals.totalBonusMes)} pts</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Filtro</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, ID, CPF, responsável..."
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1140px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-4 py-2">Cedente</th>
                <th className="text-left px-4 py-2">Clube</th>
                <th className="text-left px-4 py-2">Renovação (dia)</th>
                <th className="text-left px-4 py-2">Bônus/mês (pts)</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Assinado em</th>
                <th className="text-left px-4 py-2">Atualizado em</th>
                <th className="text-right px-4 py-2">Ação</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filtered.map((r) => {
                const d = drafts[r.id] || {
                  renewalDay: String(r.renewalDay ?? 1),
                  monthlyBonusPoints: String(r.monthlyBonusPoints ?? 0),
                };

                return (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.cedente.nomeCompleto}</div>
                      <div className="text-xs text-neutral-500">
                        {r.cedente.identificador} • CPF {r.cedente.cpf}
                      </div>
                      <div className="text-xs text-neutral-500">
                        Resp: {r.cedente.owner.name} @{r.cedente.owner.login}
                      </div>
                    </td>

                    <td className="px-4 py-2">
                      Clube {fmtInt(r.tierK)}k
                    </td>

                    <td className="px-4 py-2">
                      <input
                        value={d.renewalDay}
                        onChange={(e) =>
                          setDraftField(r.id, "renewalDay", onlyDigits(e.target.value).slice(0, 2))
                        }
                        className="w-24 rounded-md border px-2 py-1"
                        inputMode="numeric"
                      />
                    </td>

                    <td className="px-4 py-2">
                      <input
                        value={d.monthlyBonusPoints}
                        onChange={(e) =>
                          setDraftField(
                            r.id,
                            "monthlyBonusPoints",
                            onlyDigits(e.target.value).slice(0, 7)
                          )
                        }
                        className="w-40 rounded-md border px-2 py-1"
                        inputMode="numeric"
                      />
                    </td>

                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusClass(
                          r.status
                        )}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>

                    <td className="px-4 py-2">{fmtDateBR(r.subscribedAt)}</td>
                    <td className="px-4 py-2">{fmtDateBR(r.updatedAt)}</td>

                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => saveRow(r.id)}
                        disabled={savingId === r.id}
                        className="rounded-md border border-black bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {savingId === r.id ? "Salvando..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={8}>
                    Nenhum clube Livelo encontrado.
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
