"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================
 * Types
 * ========================= */
type Points = { latam: number; smiles: number; livelo: number; esfera: number };

type Snapshot = {
  id: string;
  date: string; // ISO
  createdAt?: string;
  cashCents: number;
  cutoffPoints: number;

  totalBrutoCents: number;
  totalDividasCents: number;

  totalBloqueadoCents: number;
  pendingCedenteCommissionsCents: number;
  employeePayoutsPendingCents: number;
  taxesPendingCents: number;

  totalImediatoCents: number;
};

type CedenteOpt = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  identificador: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

type BlockRow = {
  id: string;
  status: "OPEN" | "UNBLOCKED" | "CANCELED";
  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  createdAt: string;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  pointsBlocked: number;
  valueBlockedCents: number;
};

type RatesCents = {
  latamRateCents: number;
  smilesRateCents: number;
  liveloRateCents: number;
  esferaRateCents: number;
};

// ✅ resposta do GET /api/dividas-a-receber
type DARResponse = {
  ok: true;
  rows?: any[];
  totalsAll?: { totalCents: number; receivedCents: number; balanceCents: number };
  totalsOpen?: { totalCents: number; receivedCents: number; balanceCents: number }; // OPEN+PARTIAL
};

// ✅ resposta do GET /api/compras/pending-points
type PendingPointsResponse = {
  ok: true;
  data: {
    latamPoints: number;
    smilesPoints: number;
    latamCount: number;
    smilesCount: number;
  };
};

type LatamVisualizarResponse = {
  ok?: boolean;
  rows?: Array<{ latamPendente?: number }>;
  error?: string;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function dateTimeBR(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso || "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function safeInt(v: unknown, fb = 0) {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/* =========================
 * UI bits
 * ========================= */
function Input({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-1">
      <div className="text-xs text-slate-600">{label}</div>
      <input
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </label>
  );
}

function Line({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "plus" | "minus";
}) {
  const vCls =
    tone === "plus"
      ? "font-semibold text-emerald-700"
      : tone === "minus"
      ? "font-semibold text-rose-700"
      : "font-semibold text-slate-900";

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm text-slate-700">{label}</div>
        {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className={`shrink-0 text-sm ${vCls}`}>{value}</div>
    </div>
  );
}

const LS_CUTOFF_KEY = "tm.caixaImediato.cutoff";
const LS_CASH_KEY = "tm.caixaImediato.cashInput";

export default function CaixaImediatoClient() {
  const [loading, setLoading] = useState(false);

  // ✅ corte (persistido)
  const [cutoffInput, setCutoffInput] = useState<string>("5000");

  // dados
  const [cedentes, setCedentes] = useState<CedenteOpt[]>([]);
  const [blockedRows, setBlockedRows] = useState<BlockRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // caixa (persistido + pode vir do backend do caixa-imediato)
  const [cashInput, setCashInput] = useState<string>("");

  // rates (somente leitura, vem do resumo)
  const [ratesCents, setRatesCents] = useState<RatesCents | null>(null);

  // pendências / financeiro (vem do resumo)
  const [debtsOpenCents, setDebtsOpenCents] = useState<number>(0);
  const [pendingCedenteCommissionsCents, setPendingCedenteCommissionsCents] = useState<number>(0);
  const [receivablesOpenCents, setReceivablesOpenCents] = useState<number>(0);
  const [employeePayoutsPendingCents, setEmployeePayoutsPendingCents] = useState<number>(0);
  const [taxesPendingCents, setTaxesPendingCents] = useState<number>(0);

  // ✅ total “em aberto” das dívidas a receber (OPEN+PARTIAL) — vem do totalsOpen.balanceCents
  const [dividasAReceberOpenCents, setDividasAReceberOpenCents] = useState<number>(0);

  // ✅ pontos comprados pendentes (compras OPEN) — separados por programa
  const [pendingPurchaseLatamPoints, setPendingPurchaseLatamPoints] = useState(0);
  const [pendingPurchaseSmilesPoints, setPendingPurchaseSmilesPoints] = useState(0);
  const [pendingPurchaseLatamCount, setPendingPurchaseLatamCount] = useState(0);
  const [pendingPurchaseSmilesCount, setPendingPurchaseSmilesCount] = useState(0);

  const [didHydrate, setDidHydrate] = useState(false);

  // ✅ hydrate do localStorage
  useEffect(() => {
    try {
      const c = localStorage.getItem(LS_CUTOFF_KEY);
      if (c && /^\d+$/.test(c)) setCutoffInput(c);

      const cash = localStorage.getItem(LS_CASH_KEY);
      if (cash) setCashInput(cash);
    } catch {}
    setDidHydrate(true);
  }, []);

  // ✅ persistência local do cutoff e cash
  useEffect(() => {
    if (!didHydrate) return;
    try {
      localStorage.setItem(LS_CUTOFF_KEY, String(safeInt(cutoffInput, 5000)));
    } catch {}
  }, [cutoffInput, didHydrate]);

  useEffect(() => {
    if (!didHydrate) return;
    try {
      localStorage.setItem(LS_CASH_KEY, cashInput);
    } catch {}
  }, [cashInput, didHydrate]);

  async function loadAll() {
    setLoading(true);
    try {
      const [rResumo, rCedentes, rBloq, rCx, rDAR, rPendingPts, rLatamVisualizar] = await Promise.all([
        fetch("/api/resumo", { cache: "no-store" }),
        fetch("/api/cedentes/options", { cache: "no-store" }),
        fetch("/api/bloqueios", { cache: "no-store" }),
        fetch("/api/caixa-imediato", { cache: "no-store" }),
        // ✅ pode mandar take=1 só pra reduzir payload; totalsOpen continua correto
        fetch("/api/dividas-a-receber?take=1", { cache: "no-store" }),
        // ✅ NOVO: compras OPEN de pontos (pendentes de liberação)
        fetch("/api/compras/pending-points", { cache: "no-store" }),
        // ✅ fallback da mesma fonte da tela "Cedentes • Latam"
        fetch("/api/cedentes/latam", { cache: "no-store" }),
      ]);

      const jResumo = await rResumo.json();
      const jCed = await rCedentes.json();
      const jBloq = await rBloq.json();
      const jCx = await rCx.json();
      const jDAR = (await rDAR.json()) as DARResponse;
      const jPending = (await rPendingPts.json()) as PendingPointsResponse;
      const jLatamVisualizar = (await rLatamVisualizar.json()) as LatamVisualizarResponse;

      if (!jResumo?.ok) throw new Error(jResumo?.error || "Erro ao carregar resumo");
      if (!jCed?.ok) throw new Error(jCed?.error || "Erro ao carregar cedentes");
      if (!jBloq?.ok) throw new Error(jBloq?.error || "Erro ao carregar bloqueios");
      if (!jCx?.ok) throw new Error(jCx?.error || "Erro ao carregar caixa imediato");
      if (!jDAR?.ok) throw new Error((jDAR as any)?.error || "Erro ao carregar dívidas a receber");
      if (!jPending?.ok) throw new Error((jPending as any)?.error || "Erro ao carregar pontos pendentes (compras)");

      setCedentes(jCed.data || []);
      setBlockedRows(jBloq.data?.rows || []);

      // ✅ snapshots do CAIXA-IMEDIATO (separado)
      setSnapshots(jCx.data?.snapshots || []);

      // ✅ cash do CAIXA-IMEDIATO (se houver), senão mantém o digitado/localStorage
      if (typeof jCx.data?.latestCashCents === "number") {
        const latestCashCents = Number(jCx.data.latestCashCents ?? 0);
        setCashInput(String((latestCashCents / 100).toFixed(2)).replace(".", ","));
      }

      // ✅ rates (somente leitura) do resumo
      const rates = jResumo.data?.ratesCents;
      if (rates) setRatesCents(rates);

      // financeiros (do resumo)
      setDebtsOpenCents(Number(jResumo.data.debtsOpenCents || 0));
      setPendingCedenteCommissionsCents(Number(jResumo.data.pendingCedenteCommissionsCents || 0));
      setReceivablesOpenCents(Number(jResumo.data.receivablesOpenCents || 0));
      setEmployeePayoutsPendingCents(Number(jResumo.data.employeePayoutsPendingCents || 0));
      setTaxesPendingCents(Number(jResumo.data.taxesPendingCents || 0));

      // ✅ DÍVIDAS A RECEBER (TOTAL REAL em aberto): usa o agregado do backend (OPEN+PARTIAL)
      const darOpen = Number(jDAR?.totalsOpen?.balanceCents ?? 0);
      setDividasAReceberOpenCents(Number.isFinite(darOpen) ? darOpen : 0);

      // ✅ PONTOS PENDENTES (COMPRAS OPEN)
      const pendingLatamFromCompras = Number(jPending.data?.latamPoints || 0);
      const pendingLatamCountFromCompras = Number(jPending.data?.latamCount || 0);

      // Se a API de compras vier zerada e a tela LATAM tiver pendente, usa o total da tela LATAM.
      let pendingLatamFromVisualizar = 0;
      let pendingLatamCountFromVisualizar = 0;
      if (rLatamVisualizar.ok && jLatamVisualizar?.ok && Array.isArray(jLatamVisualizar.rows)) {
        pendingLatamFromVisualizar = jLatamVisualizar.rows.reduce(
          (acc, row) => acc + Number(row?.latamPendente || 0),
          0
        );
        pendingLatamCountFromVisualizar = jLatamVisualizar.rows.filter(
          (row) => Number(row?.latamPendente || 0) > 0
        ).length;
      }

      const shouldUseLatamVisualizarFallback =
        pendingLatamFromCompras <= 0 && pendingLatamFromVisualizar > 0;

      if (shouldUseLatamVisualizarFallback) {
        setPendingPurchaseLatamPoints(pendingLatamFromVisualizar);
        setPendingPurchaseLatamCount(pendingLatamCountFromVisualizar);
      } else {
        setPendingPurchaseLatamPoints(pendingLatamFromCompras);
        setPendingPurchaseLatamCount(pendingLatamCountFromCompras);
      }

      setPendingPurchaseSmilesPoints(Number(jPending.data?.smilesPoints || 0));
      setPendingPurchaseSmilesCount(Number(jPending.data?.smilesCount || 0));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ✅ Totais bloqueados (OPEN)
  const blockedTotals = useMemo(() => {
    const open = blockedRows.filter((r) => r.status === "OPEN");
    const openCount = open.length;
    const pointsBlocked = open.reduce((a, r) => a + (r.pointsBlocked || 0), 0);
    const valueBlockedCents = open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0);

    const byProgram: Points = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    for (const r of open) {
      if (r.program === "LATAM") byProgram.latam += r.pointsBlocked || 0;
      if (r.program === "SMILES") byProgram.smiles += r.pointsBlocked || 0;
      if (r.program === "LIVELO") byProgram.livelo += r.pointsBlocked || 0;
      if (r.program === "ESFERA") byProgram.esfera += r.pointsBlocked || 0;
    }

    return { openCount, pointsBlocked, valueBlockedCents, byProgram };
  }, [blockedRows]);

  // ✅ Pontos elegíveis (>= corte) por programa (somando cedentes)
  const eligible = useMemo(() => {
    const cutoff = Math.max(0, safeInt(cutoffInput, 0));

    const pts: Points = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    const counts = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };

    for (const c of cedentes) {
      const pLatam = Number(c.pontosLatam || 0);
      const pSmiles = Number(c.pontosSmiles || 0);
      const pLivelo = Number(c.pontosLivelo || 0);
      const pEsfera = Number(c.pontosEsfera || 0);

      if (pLatam >= cutoff) {
        pts.latam += pLatam;
        counts.latam += 1;
      }
      if (pSmiles >= cutoff) {
        pts.smiles += pSmiles;
        counts.smiles += 1;
      }
      if (pLivelo >= cutoff) {
        pts.livelo += pLivelo;
        counts.livelo += 1;
      }
      if (pEsfera >= cutoff) {
        pts.esfera += pEsfera;
        counts.esfera += 1;
      }
    }

    return { cutoff, pts, counts };
  }, [cedentes, cutoffInput]);

  const calc = useMemo(() => {
    // milheiros inteiros (cedentes elegíveis)
    const milLatam = Math.floor((eligible.pts.latam || 0) / 1000);
    const milSmiles = Math.floor((eligible.pts.smiles || 0) / 1000);
    const milLivelo = Math.floor((eligible.pts.livelo || 0) / 1000);
    const milEsfera = Math.floor((eligible.pts.esfera || 0) / 1000);

    // ✅ rates (do resumo). Se ainda não carregou, trata como 0.
    const rateLatamCents = ratesCents?.latamRateCents ?? 0;   // cents por milheiro
    const rateSmilesCents = ratesCents?.smilesRateCents ?? 0; // cents por milheiro
    const rateLiveloCents = ratesCents?.liveloRateCents ?? 0;
    const rateEsferaCents = ratesCents?.esferaRateCents ?? 0;

    // valor das milhas elegíveis (em cents) — milheiros inteiros
    const vLatamCents = milLatam * rateLatamCents;
    const vSmilesCents = milSmiles * rateSmilesCents;
    const vLiveloCents = milLivelo * rateLiveloCents;
    const vEsferaCents = milEsfera * rateEsferaCents;

    const milesValueEligibleCents = vLatamCents + vSmilesCents + vLiveloCents + vEsferaCents;

    // ✅ compras OPEN (pontos pendentes) — valor estimado por rate, milheiros inteiros
    const pendingLatamMil = Math.floor((pendingPurchaseLatamPoints || 0) / 1000);
    const pendingSmilesMil = Math.floor((pendingPurchaseSmilesPoints || 0) / 1000);

    const pendingLatamValueCents = pendingLatamMil * rateLatamCents;
    const pendingSmilesValueCents = pendingSmilesMil * rateSmilesCents;

    const pendingPurchasesValueCents = pendingLatamValueCents + pendingSmilesValueCents;

    const cashCents = toCentsFromInput(cashInput);

    // ✅ a receber: VENDAS (do resumo)
    const receivableSalesCents = Number(receivablesOpenCents || 0);

    // ✅ a receber: DÍVIDAS A RECEBER (TOTAL REAL em aberto do backend)
    const receivableDARcents = Number(dividasAReceberOpenCents || 0);

    // ✅ ENTRADAS (bruto)
    const totalGrossCents =
      milesValueEligibleCents +
      pendingPurchasesValueCents +
      cashCents +
      receivableSalesCents +
      receivableDARcents;

    // ✅ SAÍDAS (imediato)
    const outCents =
      (debtsOpenCents || 0) +
      (blockedTotals.valueBlockedCents || 0) +
      (pendingCedenteCommissionsCents || 0) +
      (employeePayoutsPendingCents || 0) +
      (taxesPendingCents || 0);

    // ✅ CAIXA IMEDIATO (referência)
    const totalImmediateCents = totalGrossCents - outCents;

    /**
     * ✅ Caixa projetado (Inter):
     * NÃO desconta bloqueio.
     */
    const cashProjectedInterCents =
      cashCents +
      receivableSalesCents +
      receivableDARcents -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    return {
      milLatam,
      milSmiles,
      milLivelo,
      milEsfera,

      milesValueEligibleCents,

      pendingLatamMil,
      pendingSmilesMil,
      pendingLatamValueCents,
      pendingSmilesValueCents,
      pendingPurchasesValueCents,

      cashCents,
      receivableSalesCents,
      receivableDARcents,

      totalGrossCents,
      outCents,
      totalImmediateCents,

      cashProjectedInterCents,
    };
  }, [
    eligible,
    cashInput,
    receivablesOpenCents,
    dividasAReceberOpenCents,
    debtsOpenCents,
    blockedTotals.valueBlockedCents,
    pendingCedenteCommissionsCents,
    employeePayoutsPendingCents,
    taxesPendingCents,
    ratesCents,
    pendingPurchaseLatamPoints,
    pendingPurchaseSmilesPoints,
  ]);

  async function salvarCaixaHoje() {
    try {
      const capturedAt = new Date().toISOString();
      const res = await fetch("/api/caixa-imediato/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capturedAt,
          cashCents: calc.cashCents,
          cutoffPoints: eligible.cutoff,

          // ✅ bruto inclui dívidas a receber + compras pendentes
          totalBrutoCents: calc.totalGrossCents,
          totalDividasCents: calc.outCents,

          totalBloqueadoCents: blockedTotals.valueBlockedCents,
          pendingCedenteCommissionsCents,
          employeePayoutsPendingCents,
          taxesPendingCents,

          totalImediatoCents: calc.totalImmediateCents,
        }),
      });

      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao salvar snapshot");
      await loadAll();
      alert("✅ Snapshot manual do Caixa Imediato salvo!");
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caixa imediato</h1>
          <p className="text-sm text-slate-600">
            <b>Entradas</b>: milhas elegíveis + <b>compras pendentes (OPEN)</b> + caixa + a receber (vendas) +{" "}
            <b>dívidas a receber</b>. <b>Saídas</b>: dívidas, bloqueios e pendências.
          </p>
        </div>

        <button
          onClick={loadAll}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Inputs */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <Input
            label="Ponto de corte (pts)"
            value={cutoffInput}
            onChange={setCutoffInput}
            placeholder="Ex: 5000"
            inputMode="numeric"
          />

          <Input label="Saldo atual (Inter) — R$" value={cashInput} onChange={setCashInput} placeholder="Ex: 12345,67" />

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Elegíveis (cedentes com saldo ≥ {fmtInt(eligible.cutoff)})</div>
            <div className="mt-1 grid gap-2 sm:grid-cols-4 text-sm">
              <div>
                LATAM: <b>{fmtInt(eligible.counts.latam)}</b>
              </div>
              <div>
                Smiles: <b>{fmtInt(eligible.counts.smiles)}</b>
              </div>
              <div>
                Livelo: <b>{fmtInt(eligible.counts.livelo)}</b>
              </div>
              <div>
                Esfera: <b>{fmtInt(eligible.counts.esfera)}</b>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-1">Abaixo do corte não entra no cálculo de milhas.</div>
          </div>
        </div>
      </div>

      {/* Entradas x Saídas + Saldo */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Entradas x Saídas */}
        <div className="lg:col-span-2 rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Entradas x Saídas</div>
              <div className="text-xs text-slate-500 mt-0.5">Um card só, com a lista de cada lado.</div>
            </div>

            <button onClick={salvarCaixaHoje} className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800">
              Salvar snapshot manual
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {/* Entradas */}
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Entradas</div>
                <div className="text-xs text-slate-600">
                  Total: <b className="text-emerald-700">+{fmtMoneyBR(calc.totalGrossCents)}</b>
                </div>
              </div>

              <div className="mt-3 divide-y">
                <Line
                  label="Milhas elegíveis (valor estimado)"
                  value={`+${fmtMoneyBR(calc.milesValueEligibleCents)}`}
                  tone="plus"
                  hint={`milheiros inteiros • corte ${fmtInt(eligible.cutoff)}`}
                />

                <Line
                  label="Pontos pendentes (compras OPEN) — LATAM"
                  value={`+${fmtMoneyBR(calc.pendingLatamValueCents)}`}
                  tone="plus"
                  hint={`${fmtInt(pendingPurchaseLatamPoints)} pts • ${fmtInt(calc.pendingLatamMil)} milheiros • ${fmtInt(
                    pendingPurchaseLatamCount
                  )} compras`}
                />

                <Line
                  label="Pontos pendentes (compras OPEN) — Smiles"
                  value={`+${fmtMoneyBR(calc.pendingSmilesValueCents)}`}
                  tone="plus"
                  hint={`${fmtInt(pendingPurchaseSmilesPoints)} pts • ${fmtInt(calc.pendingSmilesMil)} milheiros • ${fmtInt(
                    pendingPurchaseSmilesCount
                  )} compras`}
                />

                <Line label="Caixa (Inter)" value={`+${fmtMoneyBR(calc.cashCents)}`} tone="plus" hint="digitado nesta página (persistido)" />
                <Line label="A receber (Vendas)" value={`+${fmtMoneyBR(calc.receivableSalesCents)}`} tone="plus" hint="recebíveis OPEN (vendas)" />
                <Line
                  label="Dívidas a receber"
                  value={`+${fmtMoneyBR(calc.receivableDARcents)}`}
                  tone="plus"
                  hint="totalsOpen.balanceCents (OPEN+PARTIAL) do GET /api/dividas-a-receber"
                />
              </div>
            </div>

            {/* Saídas */}
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Saídas</div>
                <div className="text-xs text-slate-600">
                  Total: <b className="text-rose-700">-{fmtMoneyBR(calc.outCents)}</b>
                </div>
              </div>

              <div className="mt-3 divide-y">
                <Line label="Dívidas em aberto" value={`-${fmtMoneyBR(debtsOpenCents)}`} tone="minus" hint="saldo total OPEN" />
                <Line
                  label="Bloqueado (OPEN)"
                  value={`-${fmtMoneyBR(blockedTotals.valueBlockedCents)}`}
                  tone="minus"
                  hint={`${fmtInt(blockedTotals.openCount)} bloqueios`}
                />
                <Line
                  label="Comissões pendentes (cedentes)"
                  value={`-${fmtMoneyBR(pendingCedenteCommissionsCents)}`}
                  tone="minus"
                  hint="status PENDING"
                />
                <Line
                  label="A pagar (funcionários)"
                  value={`-${fmtMoneyBR(employeePayoutsPendingCents)}`}
                  tone="minus"
                  hint="netPay pendente + comissão balcão"
                />
                <Line label="Impostos pendentes" value={`-${fmtMoneyBR(taxesPendingCents)}`} tone="minus" hint="meses não pagos" />
              </div>
            </div>
          </div>
        </div>

        {/* Saldo */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="font-semibold">Saldo</div>

          <div className="rounded-2xl border bg-black p-4 text-white">
            <div className="text-xs opacity-80">Caixa imediato (referência)</div>
            <div className="text-3xl font-bold">{fmtMoneyBR(calc.totalImmediateCents)}</div>
            <div className="text-xs opacity-70 mt-1">entradas − (dívidas + bloqueios + pendências)</div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-xs text-slate-600">Caixa projetado (Inter)</div>
            <div className="text-xl font-bold">{fmtMoneyBR(calc.cashProjectedInterCents)}</div>
            <div className="text-xs text-slate-500 mt-1">caixa + a receber − (func + impostos)</div>
          </div>

          <div className="text-xs text-slate-600">* O “projetado Inter” não desconta bloqueio (igual tua regra).</div>
        </div>
      </div>

      {/* Histórico */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">Histórico manual</div>
          <div className="text-xs text-slate-500">últimos {Math.min(500, snapshots.length)} snapshots</div>
        </div>

        {snapshots.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum snapshot salvo ainda.</div>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Data e hora</th>
                  <th className="px-3 py-2 text-right">Caixa imediato</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{dateTimeBR(s.date)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoneyBR(s.totalImediatoCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs text-slate-600">
          Aqui o snapshot salva o <b>CAIXA IMEDIATO</b> (com bloqueios e pendências).
        </div>
      </div>
    </div>
  );
}
