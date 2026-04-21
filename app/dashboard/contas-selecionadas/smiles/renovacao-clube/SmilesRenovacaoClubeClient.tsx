// app/dashboard/contas-selecionadas/smiles/renovacao-clube/SmilesRenovacaoClubeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type Owner = { id: string; name: string; login: string };

type Item = {
  id: string;
  cedenteId: string;
  tierK: number;
  status: "ACTIVE" | "PAUSED" | "CANCELED";
  smilesBonusEligibleAt: string; // ISO (não-null na API)
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    pontosSmiles: number;
    owner: Owner;
  };
};

type PendingAvailableItem = {
  cedenteId: string;
  createdAt: string;
  bucket: "RECENT" | "PREVIOUS_MONTH_PENDING";
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
    pontosSmiles: number;
    owner: Owner;
  };
};

function ymdFromISO(iso: string) {
  return String(iso || "").slice(0, 10); // YYYY-MM-DD
}
function ymFromISO(iso: string) {
  return String(iso || "").slice(0, 7); // YYYY-MM
}

function monthLabelPT(ym: string) {
  // ym: YYYY-MM
  const [y, m] = ym.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(d);
}

function fmtDateBR(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "-";
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function statusRank(s: Item["status"]) {
  // em empate de data, preferir o status mais "atual"
  if (s === "ACTIVE") return 3;
  if (s === "PAUSED") return 2;
  return 1; // CANCELED
}

/**
 * ✅ Remove histórico duplicado:
 * mantém apenas o "último" por cedente (maior smilesBonusEligibleAt).
 * Assim: quando você assina de novo, o novo registro empurra o cedente pro mês futuro
 * e ele some de "Já liberados" do mês atual.
 */
function dedupLatestByCedente(list: Item[]) {
  const map = new Map<string, Item>();

  for (const it of list) {
    const key = it.cedenteId || it.cedente?.id || it.id;
    const cur = map.get(key);

    if (!cur) {
      map.set(key, it);
      continue;
    }

    const a = String(cur.smilesBonusEligibleAt || "");
    const b = String(it.smilesBonusEligibleAt || "");

    // maior data ganha
    if (b.localeCompare(a) > 0) {
      map.set(key, it);
      continue;
    }
    if (b.localeCompare(a) < 0) continue;

    // empate de data: preferir status melhor (ACTIVE > PAUSED > CANCELED)
    if (statusRank(it.status) > statusRank(cur.status)) {
      map.set(key, it);
      continue;
    }
  }

  return Array.from(map.values());
}

export default function SmilesRenovacaoClubeClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [pendingAvailable, setPendingAvailable] = useState<PendingAvailableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // hoje UTC em YYYY-MM-DD e mês atual UTC em YYYY-MM
  const todayYMD = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const currentYM = todayYMD.slice(0, 7);

  // ✅ mês selecionado (YYYY-MM) — default será sempre o mês atual
  const [selectedYM, setSelectedYM] = useState<string>(currentYM);
  const [showPendingAvailable, setShowPendingAvailable] = useState(true);

  async function load(monthKey = selectedYM || currentYM) {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/contas-selecionadas/smiles/renovacao-clube?monthKey=${encodeURIComponent(monthKey)}`,
        { cache: "no-store" }
      );
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar");

      const raw: Item[] = Array.isArray(json.items) ? json.items : [];
      const dedup = dedupLatestByCedente(raw);
      setItems(dedup);
      setPendingAvailable(
        Array.isArray(json.pendingAvailable) ? json.pendingAvailable : []
      );
    } catch (e: any) {
      setItems([]);
      setPendingAvailable([]);
      setErr(e?.message || "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(selectedYM || currentYM);
  }, [selectedYM, currentYM]);

  // ✅ meses vindos dos dados (ordenado asc)
  const monthsFromData = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(ymFromISO(it.smilesBonusEligibleAt));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // ✅ opções do select SEMPRE incluem o mês atual, mesmo que não tenha dados
  // e deixam o mês atual no topo.
  const monthOptions = useMemo(() => {
    const all = new Set<string>([currentYM, selectedYM, ...monthsFromData]);
    const sorted = Array.from(all).sort((a, b) => a.localeCompare(b));
    return [currentYM, ...sorted.filter((k) => k !== currentYM)];
  }, [currentYM, monthsFromData, selectedYM]);

  // ✅ se por algum motivo o mês selecionado não existir nas opções, volta pro mês atual
  useEffect(() => {
    if (!selectedYM) return;
    if (!monthOptions.includes(selectedYM)) setSelectedYM(currentYM);
  }, [selectedYM, monthOptions, currentYM]);

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const key = ymFromISO(it.smilesBonusEligibleAt);
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    }
    // ordenar por data dentro do mês
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) =>
        ymdFromISO(a.smilesBonusEligibleAt).localeCompare(
          ymdFromISO(b.smilesBonusEligibleAt)
        )
      );
      map.set(k, arr);
    }
    return map;
  }, [items]);

  const selectedItems = useMemo(() => {
    return groupedByMonth.get(selectedYM) || [];
  }, [groupedByMonth, selectedYM]);

  const selectedIsCurrentMonth = selectedYM === currentYM;

  const pendingStats = useMemo(() => {
    const recent = pendingAvailable.filter((it) => it.bucket === "RECENT");
    const carryOver = pendingAvailable.filter(
      (it) => it.bucket === "PREVIOUS_MONTH_PENDING"
    );
    const totalPoints = pendingAvailable.reduce(
      (acc, it) => acc + (it.cedente?.pontosSmiles || 0),
      0
    );
    return {
      total: pendingAvailable.length,
      totalPoints,
      recentCount: recent.length,
      carryOverCount: carryOver.length,
    };
  }, [pendingAvailable]);

  const selectedStats = useMemo(() => {
    const totalCedentes = selectedItems.length;
    const totalPontos = selectedItems.reduce(
      (acc, it) => acc + (it.cedente?.pontosSmiles || 0),
      0
    );

    const already = selectedItems.filter(
      (it) => ymdFromISO(it.smilesBonusEligibleAt) <= todayYMD
    );
    const future = selectedItems.filter(
      (it) => ymdFromISO(it.smilesBonusEligibleAt) > todayYMD
    );

    return {
      totalCedentes,
      totalPontos,
      alreadyCount: already.length,
      futureCount: future.length,
      already,
      future,
    };
  }, [selectedItems, todayYMD]);

  const reportByMonth = useMemo(() => {
    // ✅ relatório sempre inclui o mês atual (mesmo que 0)
    return monthOptions.map((ym) => {
      const list = groupedByMonth.get(ym) || [];
      const count = list.length;
      const sumPoints = list.reduce(
        (acc, it) => acc + (it.cedente?.pontosSmiles || 0),
        0
      );
      return { ym, count, sumPoints };
    });
  }, [monthOptions, groupedByMonth]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Renovação Clube • Smiles (Promo)
          </h1>
          <p className="text-sm text-slate-500">
            Agrupamento por mês da data <strong>Promo SMILES</strong> (data limite). Após
            essa data, o cedente volta a ficar apto para assinar novamente com bônus.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(selectedYM || currentYM)}
            className={cn(
              "border rounded-lg px-4 py-2 text-sm",
              loading ? "opacity-60" : "hover:bg-slate-50"
            )}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          <Link
            href="/dashboard/clubes"
            className="border rounded-lg px-4 py-2 text-sm hover:bg-slate-50"
          >
            Ver Clubes
          </Link>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-slate-600">Mês selecionado</div>

        <select
          value={selectedYM}
          onChange={(e) => setSelectedYM(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm min-w-[260px]"
        >
          {monthOptions.map((ym) => (
            <option key={ym} value={ym}>
              {monthLabelPT(ym)}
              {ym === currentYM ? " (mês atual)" : ""}
            </option>
          ))}
        </select>

        <div className="text-xs text-slate-500">
          Hoje (UTC): {fmtDateBR(`${todayYMD}T12:00:00.000Z`)}
        </div>

        <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showPendingAvailable}
            onChange={(e) => setShowPendingAvailable(e.target.checked)}
          />
          Mostrar não assinadas (mês atual + anterior)
        </label>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Cedentes no mês</div>
          <div className="mt-1 text-xl font-semibold">
            {fmtInt(selectedStats.totalCedentes)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">
            Total pontos SMILES (cedentes do mês)
          </div>
          <div className="mt-1 text-xl font-semibold">
            {fmtInt(selectedStats.totalPontos)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">
            {selectedIsCurrentMonth ? "Já liberados (mês atual)" : "Liberados (até hoje)"}
          </div>
          <div className="mt-1 text-xl font-semibold">
            {fmtInt(selectedStats.alreadyCount)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">
            {selectedIsCurrentMonth
              ? "Ainda vão liberar (mês atual)"
              : "Ainda não liberados"}
          </div>
          <div className="mt-1 text-xl font-semibold">
            {fmtInt(selectedStats.futureCount)}
          </div>
        </div>
      </div>

      {/* Current month split (only when viewing current month) */}
      {selectedIsCurrentMonth ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Already */}
          <div className="rounded-2xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">Já liberados neste mês</div>
              <div className="text-xs text-neutral-500">Promo SMILES ≤ hoje</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="text-left px-4 py-2">Cedente</th>
                    <th className="text-left px-4 py-2">Promo SMILES</th>
                    <th className="text-right px-4 py-2">Pontos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedStats.already.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-neutral-500" colSpan={3}>
                        Nenhum cedente liberado ainda neste mês.
                      </td>
                    </tr>
                  ) : null}

                  {selectedStats.already.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{it.cedente.nomeCompleto}</div>
                        <div className="text-xs text-neutral-500">
                          {it.cedente.identificador} • CPF {maskCpf(it.cedente.cpf)}
                        </div>
                      </td>
                      <td className="px-4 py-2">{fmtDateBR(it.smilesBonusEligibleAt)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmtInt(it.cedente.pontosSmiles)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Future */}
          <div className="rounded-2xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">Vão liberar neste mês</div>
              <div className="text-xs text-neutral-500">
                Mostra a data exata em que cada um libera
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="text-left px-4 py-2">Cedente</th>
                    <th className="text-left px-4 py-2">Libera em</th>
                    <th className="text-right px-4 py-2">Pontos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedStats.future.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-neutral-500" colSpan={3}>
                        Nenhum cedente restante para liberar neste mês.
                      </td>
                    </tr>
                  ) : null}

                  {selectedStats.future.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{it.cedente.nomeCompleto}</div>
                        <div className="text-xs text-neutral-500">
                          {it.cedente.identificador} • CPF {maskCpf(it.cedente.cpf)}
                        </div>
                      </td>
                      <td className="px-4 py-2">{fmtDateBR(it.smilesBonusEligibleAt)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmtInt(it.cedente.pontosSmiles)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {showPendingAvailable ? (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                Disponíveis para assinatura em {monthLabelPT(selectedYM || currentYM)}
              </div>
              <div className="text-xs text-neutral-500">
                Cadastros do mês selecionado + contas do mês anterior ainda sem clube
                SMILES.
              </div>
            </div>

            <div className="text-xs text-neutral-500 text-right">
              <div>Registros: {fmtInt(pendingStats.total)}</div>
              <div>
                Recentes: {fmtInt(pendingStats.recentCount)} • Pendentes do mês anterior:{" "}
                {fmtInt(pendingStats.carryOverCount)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="text-left px-4 py-2">Cedente</th>
                  <th className="text-left px-4 py-2">Responsável</th>
                  <th className="text-left px-4 py-2">Cadastrado em</th>
                  <th className="text-left px-4 py-2">Faixa</th>
                  <th className="text-right px-4 py-2">Pontos Smiles</th>
                  <th className="text-left px-4 py-2">Situação</th>
                  <th className="text-right px-4 py-2">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingAvailable.length === 0 && !loading ? (
                  <tr>
                    <td className="px-4 py-8 text-neutral-500" colSpan={7}>
                      Nenhuma conta recente ou pendente do mês anterior sem assinatura.
                    </td>
                  </tr>
                ) : null}

                {pendingAvailable.map((it) => (
                  <tr key={it.cedenteId} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{it.cedente.nomeCompleto}</div>
                      <div className="text-xs text-neutral-500">
                        {it.cedente.identificador} • CPF {maskCpf(it.cedente.cpf)}
                      </div>
                    </td>

                    <td className="px-4 py-2">
                      <div className="font-medium">{it.cedente.owner?.name}</div>
                      <div className="text-xs text-neutral-500">
                        @{it.cedente.owner?.login}
                      </div>
                    </td>

                    <td className="px-4 py-2">{fmtDateBR(it.createdAt)}</td>

                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                          it.bucket === "RECENT"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {it.bucket === "RECENT"
                          ? "CADASTRO RECENTE"
                          : "MÊS ANTERIOR"}
                      </span>
                    </td>

                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtInt(it.cedente.pontosSmiles)}
                    </td>

                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border border-emerald-200 bg-emerald-50 text-emerald-700">
                        DISPONÍVEL P/ ASSINAR
                      </span>
                      <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs border border-slate-200 bg-slate-50 text-slate-700">
                        {it.cedente.status}
                      </span>
                    </td>

                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/dashboard/clubes/cadastrar?program=SMILES&cedenteId=${encodeURIComponent(
                          it.cedenteId
                        )}`}
                        className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        Assinar
                      </Link>
                    </td>
                  </tr>
                ))}

                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-neutral-500" colSpan={7}>
                      Carregando...
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Month table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">
              Cedentes aptos em {monthLabelPT(selectedYM || currentYM)}
            </div>
            <div className="text-xs text-neutral-500">
              Ordenado pela data Promo SMILES dentro do mês
            </div>
          </div>

          <div className="text-xs text-neutral-500">
            Registros: {fmtInt(selectedItems.length)}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-4 py-2">Cedente</th>
                <th className="text-left px-4 py-2">Responsável</th>
                <th className="text-left px-4 py-2">Tier</th>
                <th className="text-left px-4 py-2">Promo SMILES</th>
                <th className="text-right px-4 py-2">Pontos Smiles</th>
                <th className="text-left px-4 py-2">Situação</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {selectedItems.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-8 text-neutral-500" colSpan={6}>
                    Nenhum cedente com Promo SMILES neste mês.
                  </td>
                </tr>
              ) : null}

              {selectedItems.map((it) => {
                const eligible = ymdFromISO(it.smilesBonusEligibleAt) <= todayYMD;

                return (
                  <tr key={it.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{it.cedente.nomeCompleto}</div>
                      <div className="text-xs text-neutral-500">
                        {it.cedente.identificador} • CPF {maskCpf(it.cedente.cpf)}
                      </div>
                    </td>

                    <td className="px-4 py-2">
                      <div className="font-medium">{it.cedente.owner?.name}</div>
                      <div className="text-xs text-neutral-500">
                        @{it.cedente.owner?.login}
                      </div>
                    </td>

                    <td className="px-4 py-2">{it.tierK}k</td>

                    <td className="px-4 py-2">{fmtDateBR(it.smilesBonusEligibleAt)}</td>

                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtInt(it.cedente.pontosSmiles)}
                    </td>

                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                          eligible
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-yellow-200 bg-yellow-50 text-yellow-700"
                        )}
                      >
                        {eligible ? "LIBERADO" : "AGUARDANDO"}
                      </span>

                      <span
                        className={cn(
                          "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                          it.status === "ACTIVE"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : it.status === "PAUSED"
                            ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        )}
                        title="Status do clube (ACTIVE/PAUSED/CANCELED)"
                      >
                        {it.status}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-neutral-500" colSpan={6}>
                    Carregando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report by month */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="text-sm font-semibold">Relatório por mês</div>
          <div className="text-xs text-neutral-500">
            Quantidade de cedentes que liberam a Promo SMILES em cada mês + soma de pontos.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-4 py-2">Mês</th>
                <th className="text-right px-4 py-2">Cedentes</th>
                <th className="text-right px-4 py-2">Soma pontos Smiles</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reportByMonth.map((r) => (
                <tr
                  key={r.ym}
                  className={cn(
                    "hover:bg-neutral-50",
                    r.ym === selectedYM && "bg-neutral-50"
                  )}
                >
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedYM(r.ym)}
                      className="text-left hover:underline"
                      title="Selecionar mês"
                    >
                      {monthLabelPT(r.ym)}
                      {r.ym === currentYM ? " (mês atual)" : ""}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtInt(r.count)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtInt(r.sumPoints)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        Fonte: ClubSubscription (SMILES) + campo <code>smilesBonusEligibleAt</code> + pontos do
        cedente (<code>pontosSmiles</code>). A seção de disponíveis usa{" "}
        <code>Cedente.createdAt</code> + ausência de clube SMILES.
      </div>
    </div>
  );
}
