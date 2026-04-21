"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type LoyaltyProgram = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Cedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  scoreMedia?: number;
};

type PurchaseStatus = "OPEN" | "DRAFT" | "READY" | "CLOSED" | "CANCELED";

type PurchaseItemType =
  | "CLUB"
  | "POINTS_BUY"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "EXTRA_COST";

type TransferMode = "FULL_POINTS" | "POINTS_PLUS_CASH";

type PurchaseItem = {
  id?: string;
  type: PurchaseItemType;
  title: string;
  details?: string;

  programFrom?: LoyaltyProgram | null;
  programTo?: LoyaltyProgram | null;

  pointsBase: number;
  bonusMode?: "PERCENT" | "TOTAL" | "" | null;
  bonusValue?: number | null;
  pointsFinal: number;

  transferMode?: TransferMode | null;
  pointsDebitedFromOrigin: number;

  amountCents: number;
};

type PurchaseDraft = {
  id: string;
  numero: string;
  status: PurchaseStatus;

  cedenteId: string;

  ciaProgram: LoyaltyProgram | null;
  ciaPointsTotal: number;

  cedentePayCents: number;
  vendorCommissionBps: number;
  targetMarkupCents: number;

  subtotalCostCents: number;
  vendorCommissionCents: number;
  totalCostCents: number;

  costPerKiloCents: number;
  targetPerKiloCents: number;

  expectedLatamPoints: number | null;
  expectedSmilesPoints: number | null;
  expectedLiveloPoints: number | null;
  expectedEsferaPoints: number | null;

  note: string | null;

  items: PurchaseItem[];
};

type ClubMeta = {
  program: LoyaltyProgram;
  tierK: number;
  priceCents: number;
  renewalDay: number;
  startDateISO: string;
  bonusPoints: number;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function normalizeScore(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}
function fmtScore(v: unknown) {
  return normalizeScore(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
function scoreBadgeClass(v: unknown) {
  const s = normalizeScore(v);
  if (s >= 8) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s >= 6) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s >= 4) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}
function clampInt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.trunc(x);
}
function roundCents(n: number) {
  return Math.round(n);
}
function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function clampDay(n: any) {
  const x = clampInt(n);
  if (x <= 0) return 1;
  if (x > 31) return 31;
  return x;
}
function safeJsonParse<T>(s?: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function calcItemPointsFinal(item: PurchaseItem) {
  const base = clampInt(item.pointsBase);
  const mode = item.bonusMode || "";
  const val = item.bonusValue ?? 0;

  if (!mode) return base;

  if (mode === "PERCENT") {
    const pct = Math.max(0, clampInt(val));
    const bonus = Math.round((base * pct) / 100);
    return base + bonus;
  }

  if (mode === "TOTAL") {
    const total = Math.max(0, clampInt(val));
    return base + total;
  }

  return base;
}

function pointsForMilheiro(d: PurchaseDraft) {
  const cia = d.ciaProgram;
  if (cia === "LATAM")
    return clampInt(d.expectedLatamPoints ?? d.ciaPointsTotal ?? 0);
  if (cia === "SMILES")
    return clampInt(d.expectedSmilesPoints ?? d.ciaPointsTotal ?? 0);
  return clampInt(d.ciaPointsTotal ?? 0);
}

function computeTotals(d: PurchaseDraft) {
  const itemsArr = Array.isArray(d.items) ? d.items : [];
  const itemsCost = itemsArr.reduce(
    (acc, it) => acc + (it.amountCents || 0),
    0
  );

  const subtotal = itemsCost + (d.cedentePayCents || 0);

  const vendor = roundCents(
    (subtotal * (d.vendorCommissionBps || 0)) / 10000
  );
  const total = subtotal + vendor;

  const pts = Math.max(0, pointsForMilheiro(d));
  const denom = pts / 1000;

  const costPerKilo = denom > 0 ? roundCents(total / denom) : 0;
  const targetPerKilo = costPerKilo + (d.targetMarkupCents || 0);

  return {
    subtotalCostCents: subtotal,
    vendorCommissionCents: vendor,
    totalCostCents: total,
    costPerKiloCents: costPerKilo,
    targetPerKiloCents: targetPerKilo,
  };
}

function computeProgramDeltas(items: PurchaseItem[]) {
  const out: Record<LoyaltyProgram, number> = {
    LATAM: 0,
    SMILES: 0,
    LIVELO: 0,
    ESFERA: 0,
  };

  const arr = Array.isArray(items) ? items : [];
  for (const it of arr) {
    if (it.programTo) out[it.programTo] += clampInt(it.pointsFinal);
    if (it.programFrom)
      out[it.programFrom] -= clampInt(it.pointsDebitedFromOrigin);
  }
  return out;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.ok === false) {
    console.error("API FAIL:", url, res.status, data);
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data as T;
}

function norm(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function onlyDigits(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

const PROGRAM_LABEL: Record<LoyaltyProgram, string> = {
  LATAM: "LATAM",
  SMILES: "Smiles",
  LIVELO: "Livelo",
  ESFERA: "Esfera",
};

const CLUB_TIERS = [1, 2, 3, 5, 7, 10, 12, 15, 20];

/** ✅ NORMALIZAÇÃO CENTRAL (mata o reduce undefined) */
function normalizeItem(it: any): PurchaseItem {
  return {
    id: it?.id ?? undefined,
    type: (it?.type || "TRANSFER") as PurchaseItemType,
    title: String(it?.title || ""),
    details: it?.details ? String(it.details) : "",

    programFrom: (it?.programFrom ?? null) as any,
    programTo: (it?.programTo ?? null) as any,

    pointsBase: clampInt(it?.pointsBase),
    bonusMode: (it?.bonusMode ?? "") as any,
    bonusValue:
      it?.bonusValue === null || it?.bonusValue === undefined
        ? 0
        : clampInt(it?.bonusValue),
    pointsFinal: clampInt(it?.pointsFinal),

    transferMode: (it?.transferMode ?? null) as any,
    pointsDebitedFromOrigin: clampInt(it?.pointsDebitedFromOrigin),

    amountCents: clampInt(it?.amountCents),
  };
}

function normalizeDraft(raw: any, cedenteSel?: Cedente | null): PurchaseDraft {
  const items = Array.isArray(raw?.items) ? raw.items.map(normalizeItem) : [];

  const d: PurchaseDraft = {
    id: String(raw?.id || ""),
    numero: String(raw?.numero || ""),
    status: (raw?.status || "DRAFT") as PurchaseStatus,

    cedenteId: String(raw?.cedenteId || cedenteSel?.id || ""),

    ciaProgram: (raw?.ciaProgram ?? raw?.ciaAerea ?? null) as any,
    ciaPointsTotal: clampInt(raw?.ciaPointsTotal ?? raw?.pontosCiaTotal ?? 0),

    cedentePayCents: clampInt(raw?.cedentePayCents ?? 0),
    vendorCommissionBps: clampInt(raw?.vendorCommissionBps ?? 0),
    targetMarkupCents: clampInt(
      raw?.targetMarkupCents ?? raw?.metaMarkupCents ?? 0
    ),

    subtotalCostCents: clampInt(
      raw?.subtotalCostCents ?? raw?.subtotalCents ?? 0
    ),
    vendorCommissionCents: clampInt(
      raw?.vendorCommissionCents ?? raw?.comissaoCents ?? 0
    ),
    totalCostCents: clampInt(raw?.totalCostCents ?? raw?.totalCents ?? 0),

    costPerKiloCents: clampInt(
      raw?.costPerKiloCents ?? raw?.custoMilheiroCents ?? 0
    ),
    targetPerKiloCents: clampInt(
      raw?.targetPerKiloCents ?? raw?.metaMilheiroCents ?? 0
    ),

    expectedLatamPoints: raw?.expectedLatamPoints ?? raw?.saldoPrevistoLatam ?? null,
    expectedSmilesPoints:
      raw?.expectedSmilesPoints ?? raw?.saldoPrevistoSmiles ?? null,
    expectedLiveloPoints:
      raw?.expectedLiveloPoints ?? raw?.saldoPrevistoLivelo ?? null,
    expectedEsferaPoints:
      raw?.expectedEsferaPoints ?? raw?.saldoPrevistoEsfera ?? null,

    note: raw?.note ?? raw?.observacao ?? null,

    items,
  };

  // defaults pelo cedente (se tiver)
  if (cedenteSel) {
    if (d.expectedLatamPoints === null || d.expectedLatamPoints === undefined)
      d.expectedLatamPoints = cedenteSel.pontosLatam ?? 0;
    if (d.expectedSmilesPoints === null || d.expectedSmilesPoints === undefined)
      d.expectedSmilesPoints = cedenteSel.pontosSmiles ?? 0;
    if (d.expectedLiveloPoints === null || d.expectedLiveloPoints === undefined)
      d.expectedLiveloPoints = cedenteSel.pontosLivelo ?? 0;
    if (d.expectedEsferaPoints === null || d.expectedEsferaPoints === undefined)
      d.expectedEsferaPoints = cedenteSel.pontosEsfera ?? 0;
  }

  return d;
}

export default function NovaCompraClient({ purchaseId }: { purchaseId?: string }) {
  // ✅ pega /.../[id] quando existir (e mantém compatível com prop purchaseId)
  const params = useParams() as Record<string, string | string[] | undefined>;
  const routeIdRaw = params?.id;
  const routeId = Array.isArray(routeIdRaw) ? routeIdRaw[0] : routeIdRaw;
  const purchaseIdFinal = purchaseId || routeId;

  const [query, setQuery] = useState("");
  const [allCedentes, setAllCedentes] = useState<Cedente[]>([]);
  const [cedenteSel, setCedenteSel] = useState<Cedente | null>(null);
  const [loadingCed, setLoadingCed] = useState(false);

  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  const [itemsAllowManualFinal, setItemsAllowManualFinal] = useState<
    Record<string, boolean>
  >({});
  const [expectedAuto, setExpectedAuto] = useState<
    Record<LoyaltyProgram, boolean>
  >({
    LATAM: true,
    SMILES: true,
    LIVELO: true,
    ESFERA: true,
  });

  // ===== load compra existente (modo edição)
  useEffect(() => {
    if (!purchaseIdFinal) return;

    (async () => {
      try {
        setSaving(true);

        const out = await api<{ compra: any; cedente: Cedente }>(
          `/api/compras/${purchaseIdFinal}`
        );

        setCedenteSel(out.cedente);

        const p = normalizeDraft(out.compra, out.cedente);
        const totals = computeTotals(p);

        setDraft({ ...p, ...totals });
      } catch (e: any) {
        setError(e?.message || "Falha ao carregar compra.");
      } finally {
        setSaving(false);
      }
    })();
  }, [purchaseIdFinal]);

  // ===== load cedentes
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoadingCed(true);
      try {
        const out = await api<{ ok: true; data: Cedente[] }>(
          `/api/cedentes/approved`
        );
        if (!alive) return;
        setAllCedentes(Array.isArray(out?.data) ? out.data : []);
      } catch (e: any) {
        console.error("Falha ao carregar cedentes aprovados:", e);
        if (!alive) return;
        setAllCedentes([]);
      } finally {
        if (alive) setLoadingCed(false);
      }
    };

    load();
    return () => {
      alive = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const cedentes = useMemo(() => {
    const s = norm(query);
    if (s.length < 2) return [];

    const dig = onlyDigits(query);

    return allCedentes
      .filter((c) => {
        const nome = norm(c.nomeCompleto);
        const ident = norm(c.identificador);
        const cpfDig = onlyDigits(c.cpf);

        if (dig.length >= 2) {
          return (
            cpfDig.includes(dig) ||
            onlyDigits(c.identificador).includes(dig) ||
            nome.includes(s) ||
            ident.includes(s)
          );
        }

        return nome.includes(s) || ident.includes(s) || cpfDig.includes(s);
      })
      .slice(0, 30);
  }, [allCedentes, query]);

  async function createDraft() {
    if (!cedenteSel) return;
    setError(null);
    setSaving(true);

    try {
      const out = await api<{ ok: true; compra: any }>(`/api/compras`, {
        method: "POST",
        body: JSON.stringify({ cedenteId: cedenteSel.id }),
      });

      const p = normalizeDraft(out.compra, cedenteSel);
      const totals = computeTotals(p);

      setDraft({ ...p, ...totals });
    } catch (e: any) {
      setError(e?.message || "Falha ao criar compra.");
    } finally {
      setSaving(false);
    }
  }

  function scheduleAutosave(next: PurchaseDraft) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(next);
    }, 650);
  }

  async function saveDraft(nextDraft?: PurchaseDraft, silent?: boolean) {
    const d0 = nextDraft || draft;
    if (!d0) return;

    const d = normalizeDraft(d0, cedenteSel);

    setError(null);
    if (!silent) setSaving(true);

    try {
      const totals = computeTotals(d);
      const payload = { ...d, ...totals };

      setDraft(payload);

      await api<{ ok: true }>(`/api/compras/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ciaProgram: payload.ciaProgram,
          ciaPointsTotal: payload.ciaPointsTotal,

          cedentePayCents: payload.cedentePayCents,
          vendorCommissionBps: payload.vendorCommissionBps,
          targetMarkupCents: payload.targetMarkupCents,

          note: payload.note,

          expectedLatamPoints: payload.expectedLatamPoints,
          expectedSmilesPoints: payload.expectedSmilesPoints,
          expectedLiveloPoints: payload.expectedLiveloPoints,
          expectedEsferaPoints: payload.expectedEsferaPoints,

          items: payload.items,

          subtotalCostCents: payload.subtotalCostCents,
          vendorCommissionCents: payload.vendorCommissionCents,
          totalCostCents: payload.totalCostCents,
          costPerKiloCents: payload.costPerKiloCents,
          targetPerKiloCents: payload.targetPerKiloCents,
        }),
      });
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      if (!silent) setSaving(false);
    }
  }

  async function releasePurchase() {
    if (!draft) return;
    setError(null);
    setSaving(true);

    try {
      await saveDraft(draft, true);

      const out = await api<{ ok: true; compra: any }>(
        `/api/compras/${draft.id}/liberar`,
        {
          method: "POST",
          body: JSON.stringify({
            saldosAplicados: {
              latam: draft.expectedLatamPoints ?? undefined,
              smiles: draft.expectedSmilesPoints ?? undefined,
              livelo: draft.expectedLiveloPoints ?? undefined,
              esfera: draft.expectedEsferaPoints ?? undefined,
            },
          }),
        }
      );

      const p2 = normalizeDraft(out.compra, cedenteSel);
      const totals2 = computeTotals(p2);

      setDraft({ ...p2, ...totals2 });
    } catch (e: any) {
      setError(e?.message || "Falha ao liberar.");
    } finally {
      setSaving(false);
    }
  }

  const isReleased = draft?.status === "CLOSED";

  const totals = useMemo(() => {
    if (!draft) return null;
    return computeTotals(draft);
  }, [draft]);

  function updateDraft(patch: Partial<PurchaseDraft>) {
    if (!draft) return;
    const next = normalizeDraft({ ...draft, ...patch }, cedenteSel);
    const t = computeTotals(next);
    const merged = { ...next, ...t };
    setDraft(merged);
    scheduleAutosave(merged);
  }

  const clubItems = useMemo(() => {
    if (!draft) return [];
    const arr = Array.isArray(draft.items) ? draft.items : [];
    return arr.filter((i) => i.type === "CLUB");
  }, [draft]);

  const otherItems = useMemo(() => {
    if (!draft) return [];
    const arr = Array.isArray(draft.items) ? draft.items : [];
    return arr.filter((i) => i.type !== "CLUB");
  }, [draft]);

  function makeKey(it: PurchaseItem, idx: number) {
    return it.id || `idx_${idx}`;
  }

  function addTransferItem() {
    if (!draft) return;

    const nextItem: PurchaseItem = {
      type: "TRANSFER",
      title: "Transferência",
      details: "",
      programFrom: "LIVELO",
      programTo: "SMILES",
      pointsBase: 0,
      bonusMode: "PERCENT",
      bonusValue: 0,
      pointsFinal: 0,
      transferMode: "FULL_POINTS",
      pointsDebitedFromOrigin: 0,
      amountCents: 0,
    };

    updateDraft({ items: [...(draft.items ?? []), nextItem] });
  }

  function addClub() {
    if (!draft) return;

    const meta: ClubMeta = {
      program: "LIVELO",
      tierK: 10,
      priceCents: 0,
      renewalDay: new Date().getDate(),
      startDateISO: isoToday(),
      bonusPoints: 0,
    };

    const item: PurchaseItem = {
      type: "CLUB",
      title: `Clube ${PROGRAM_LABEL[meta.program]} ${meta.tierK}k`,
      details: JSON.stringify(meta),
      programFrom: null,
      programTo: meta.program,
      pointsBase: meta.tierK * 1000,
      bonusMode: "TOTAL",
      bonusValue: meta.bonusPoints,
      pointsFinal: meta.tierK * 1000 + Math.max(0, clampInt(meta.bonusPoints)),
      transferMode: null,
      pointsDebitedFromOrigin: 0,
      amountCents: meta.priceCents,
    };

    updateDraft({ items: [...(draft.items ?? []), item] });
  }

  function removeItemByIndex(realIdx: number) {
    if (!draft) return;
    const items = [...(draft.items ?? [])];
    items.splice(realIdx, 1);
    updateDraft({ items });
  }

  function updateItem(realIdx: number, patch: Partial<PurchaseItem>) {
    if (!draft) return;

    const items = [...(draft.items ?? [])];
    const cur = items[realIdx] || normalizeItem({});
    const merged: PurchaseItem = normalizeItem({ ...cur, ...patch });

    const canAuto =
      merged.type === "TRANSFER" ||
      merged.type === "POINTS_BUY" ||
      merged.type === "ADJUSTMENT" ||
      merged.type === "CLUB";

    const key = merged.id || `idx_${realIdx}`;
    const allowManual = !!itemsAllowManualFinal[key];

    if (canAuto && !allowManual) {
      merged.pointsFinal = calcItemPointsFinal(merged);
    }

    if (merged.type === "CLUB") {
      const meta = safeJsonParse<ClubMeta>(merged.details) || null;
      if (meta) {
        const bonusPoints = Math.max(0, clampInt(meta.bonusPoints ?? 0));
        const pointsBase = Math.max(0, clampInt(meta.tierK) * 1000);
        merged.title = `Clube ${PROGRAM_LABEL[meta.program]} ${meta.tierK}k`;
        merged.programTo = meta.program;
        merged.pointsBase = pointsBase;
        merged.bonusMode = "TOTAL";
        merged.bonusValue = bonusPoints;
        merged.pointsFinal = allowManual
          ? merged.pointsFinal
          : calcItemPointsFinal({
              ...merged,
              pointsBase,
              bonusMode: "TOTAL",
              bonusValue: bonusPoints,
            });
        merged.amountCents = meta.priceCents;
      }
    }

    items[realIdx] = merged;
    updateDraft({ items });
  }

  // Auto: ciaPointsTotal = soma itens programTo=CIA (se estiver 0)
  useEffect(() => {
    if (!draft || !draft.ciaProgram || isReleased) return;
    if ((draft.ciaPointsTotal || 0) > 0) return;

    const itemsArr = Array.isArray(draft.items) ? draft.items : [];
    const sum = itemsArr
      .filter((it) => it.programTo === draft.ciaProgram)
      .reduce((acc, it) => acc + (it.pointsFinal || 0), 0);

    if (sum > 0) updateDraft({ ciaPointsTotal: sum });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.ciaProgram, draft?.items, isReleased]);

  const computedExpected = useMemo(() => {
    if (!cedenteSel || !draft) return null;

    const deltas = computeProgramDeltas(draft.items ?? []);

    return {
      LATAM: (cedenteSel.pontosLatam || 0) + deltas.LATAM,
      SMILES: (cedenteSel.pontosSmiles || 0) + deltas.SMILES,
      LIVELO: (cedenteSel.pontosLivelo || 0) + deltas.LIVELO,
      ESFERA: (cedenteSel.pontosEsfera || 0) + deltas.ESFERA,
      deltas,
    };
  }, [cedenteSel, draft]);

  useEffect(() => {
    if (!draft || !cedenteSel || !computedExpected || isReleased) return;

    const patch: Partial<PurchaseDraft> = {};

    if (expectedAuto.LATAM) patch.expectedLatamPoints = computedExpected.LATAM;
    if (expectedAuto.SMILES) patch.expectedSmilesPoints = computedExpected.SMILES;
    if (expectedAuto.LIVELO) patch.expectedLiveloPoints = computedExpected.LIVELO;
    if (expectedAuto.ESFERA) patch.expectedEsferaPoints = computedExpected.ESFERA;

    const changed =
      (expectedAuto.LATAM &&
        draft.expectedLatamPoints !== patch.expectedLatamPoints) ||
      (expectedAuto.SMILES &&
        draft.expectedSmilesPoints !== patch.expectedSmilesPoints) ||
      (expectedAuto.LIVELO &&
        draft.expectedLiveloPoints !== patch.expectedLiveloPoints) ||
      (expectedAuto.ESFERA &&
        draft.expectedEsferaPoints !== patch.expectedEsferaPoints);

    if (changed) updateDraft(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedExpected, expectedAuto, isReleased]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Nova compra</h1>
          <p className="text-sm text-gray-600">
            Crie a compra em rascunho e só aplique no saldo ao <b>LIBERAR</b>.
          </p>

          {draft && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="rounded-full border px-2 py-1">
                Compra: <span className="font-mono">{draft.numero}</span>
              </span>

              <span
                className={`rounded-full border px-2 py-1 ${
                  draft.status === "CLOSED"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-gray-50"
                }`}
              >
                Status: <span className="font-mono">{draft.status}</span>
              </span>

              <span className="rounded-full border px-2 py-1">
                Autosave: {saving ? "salvando…" : "ativo"}
              </span>
            </div>
          )}
        </div>

        {draft && (
          <DraftActions
            draft={draft}
            saving={saving}
            isReleased={!!isReleased}
            onSave={() => void saveDraft(draft)}
            onRelease={releasePurchase}
          />
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1) Cedente */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">1) Cedente</h2>
          <span className="text-xs text-gray-500">
            Selecione e gere o ID único
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm text-gray-600">Buscar cedente</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Nome, CPF, identificador..."
              disabled={!!draft}
            />

            {loadingCed && (
              <div className="mt-1 text-xs text-gray-500">
                Carregando cedentes aprovados…
              </div>
            )}

            {!draft &&
              query.trim().length >= 2 &&
              cedentes.length === 0 &&
              !loadingCed && (
                <div className="mt-2 text-xs text-gray-500">
                  Nenhum cedente encontrado.
                </div>
              )}

            {!draft && cedentes.length > 0 && (
              <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                {cedentes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCedenteSel(c)}
                    className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      cedenteSel?.id === c.id ? "bg-gray-50" : ""
                    }`}
                  >
                    <div>
                      <div className="font-medium">{c.nomeCompleto}</div>
                      <div className="text-xs text-gray-500">
                        CPF: {c.cpf} · ID: {c.identificador}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 text-right">
                      <div
                        className={`inline-flex rounded-full border px-2 py-0.5 ${scoreBadgeClass(
                          c.scoreMedia
                        )}`}
                      >
                        Score {fmtScore(c.scoreMedia)}
                      </div>
                      <div>LATAM {c.pontosLatam}</div>
                      <div>SMILES {c.pontosSmiles}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm font-medium">Selecionado</div>

            {!cedenteSel && (
              <div className="text-sm text-gray-600">Nenhum.</div>
            )}

            {cedenteSel && (
              <div className="text-sm text-gray-700 space-y-1">
                <div className="font-medium">{cedenteSel.nomeCompleto}</div>
                <div className="text-xs text-gray-500">
                  CPF {cedenteSel.cpf} · {cedenteSel.identificador}
                </div>
                <div className="text-xs">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 ${scoreBadgeClass(
                      cedenteSel.scoreMedia
                    )}`}
                  >
                    Score médio {fmtScore(cedenteSel.scoreMedia)}/10
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Saldos atuais: LATAM {cedenteSel.pontosLatam} · SMILES{" "}
                  {cedenteSel.pontosSmiles} · LIVELO {cedenteSel.pontosLivelo} ·
                  ESFERA {cedenteSel.pontosEsfera}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={createDraft}
                disabled={!cedenteSel || saving || !!draft}
                className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {draft ? "Compra criada" : "Gerar compra (ID único)"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2) Config + Resumo */}
      {draft && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">2) Configuração</h2>
              <div className="text-xs text-gray-500">
                Ajustes gerais da compra (comissão, taxa, etc.)
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="text-sm text-gray-600">Observação</label>
                <input
                  value={draft.note || ""}
                  disabled={!!isReleased}
                  onChange={(e) => updateDraft({ note: e.target.value })}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-sm text-gray-600">
                  Taxa cedente (R$)
                </label>
                <input
                  type="number"
                  value={draft.cedentePayCents / 100}
                  disabled={!!isReleased}
                  onChange={(e) =>
                    updateDraft({
                      cedentePayCents: roundCents(
                        Number(e.target.value || 0) * 100
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Comissão vendedor (%)
                </label>
                <input
                  type="number"
                  value={draft.vendorCommissionBps / 100}
                  disabled={!!isReleased}
                  onChange={(e) =>
                    updateDraft({
                      vendorCommissionBps: roundCents(
                        Number(e.target.value || 0) * 100
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="1 = 1%"
                />
                <div className="mt-1 text-xs text-gray-500">
                  Interno em bps. Use 1 para 1%.
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Markup meta (R$/milheiro)
                </label>
                <input
                  type="number"
                  value={draft.targetMarkupCents / 100}
                  disabled={!!isReleased}
                  onChange={(e) =>
                    updateDraft({
                      targetMarkupCents: roundCents(
                        Number(e.target.value || 0) * 100
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="1.50"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4 lg:sticky lg:top-4 h-fit space-y-3">
            <div className="text-sm font-medium">Resumo</div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
              <Row
                label="Subtotal"
                value={fmtMoneyBR(totals?.subtotalCostCents || 0)}
              />
              <Row
                label="Comissão"
                value={fmtMoneyBR(totals?.vendorCommissionCents || 0)}
              />
              <div className="h-px bg-gray-200 my-2" />
              <Row
                label="Total"
                value={fmtMoneyBR(totals?.totalCostCents || 0)}
                bold
              />
              <div className="h-px bg-gray-200 my-2" />
              <Row
                label="Milheiro"
                value={fmtMoneyBR(totals?.costPerKiloCents || 0)}
                bold
              />
              <Row
                label="Meta"
                value={fmtMoneyBR(totals?.targetPerKiloCents || 0)}
                bold
              />
            </div>

            <div className="text-xs text-gray-500">
              Dica: selecione a CIA na etapa 5. O milheiro usa o <b>Esperado</b>{" "}
              da CIA.
            </div>
          </div>
        </div>
      )}

      {/* 3) Clubes */}
      {draft && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">3) Clubes (assinaturas)</h2>

            <button
              type="button"
              onClick={addClub}
              disabled={!!isReleased}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              + Adicionar clube
            </button>
          </div>

          {clubItems.length === 0 && (
            <div className="text-sm text-gray-600">
              Nenhum clube adicionado.
            </div>
          )}

          {clubItems.length > 0 && (
            <div className="overflow-auto rounded-lg border">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="p-2">Programa</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Valor (R$)</th>
                    <th className="p-2">Renova (dia)</th>
                    <th className="p-2">Data assinatura</th>
                    <th className="p-2">Base pts/mês</th>
                    <th className="p-2">Bônus (milhas)</th>
                    <th className="p-2">Total pts/mês</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(draft.items ?? []).map((it, realIdx) => {
                    if (it.type !== "CLUB") return null;

                    const bonusFromItem =
                      (it.bonusMode === "TOTAL" ? clampInt(it.bonusValue || 0) : 0) || 0;

                    const parsedMeta = safeJsonParse<ClubMeta>(it.details);
                    const meta = parsedMeta
                      ? {
                          ...parsedMeta,
                          bonusPoints: Math.max(
                            0,
                            clampInt(parsedMeta.bonusPoints ?? bonusFromItem)
                          ),
                        }
                      : {
                          program: (it.programTo || "LIVELO") as LoyaltyProgram,
                          tierK:
                            Math.max(
                              1,
                              Math.round((it.pointsFinal || 0) / 1000) || 10
                            ) || 10,
                          priceCents: it.amountCents || 0,
                          renewalDay: new Date().getDate(),
                          startDateISO: isoToday(),
                          bonusPoints: Math.max(0, bonusFromItem),
                        };

                    return (
                      <tr key={realIdx} className="border-t">
                        <td className="p-2">
                          <select
                            value={meta.program}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                program: e.target.value as LoyaltyProgram,
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                programTo: next.program,
                              });
                            }}
                            className="w-full rounded-md border px-2 py-1"
                          >
                            <option value="LIVELO">Livelo</option>
                            <option value="SMILES">Smiles</option>
                            <option value="LATAM">LATAM</option>
                            <option value="ESFERA">Esfera</option>
                          </select>
                        </td>

                        <td className="p-2">
                          <select
                            value={meta.tierK}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                tierK: clampInt(e.target.value),
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                pointsBase: next.tierK * 1000,
                                pointsFinal: next.tierK * 1000,
                              });
                            }}
                            className="w-full rounded-md border px-2 py-1"
                          >
                            {CLUB_TIERS.map((k) => (
                              <option key={k} value={k}>
                                {k}k
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2">
                          <input
                            type="number"
                            value={(meta.priceCents || 0) / 100}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const cents = roundCents(
                                Number(e.target.value || 0) * 100
                              );
                              const next: ClubMeta = {
                                ...meta,
                                priceCents: cents,
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                amountCents: cents,
                              });
                            }}
                            className="w-full rounded-md border px-2 py-1"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            type="number"
                            value={meta.renewalDay}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                renewalDay: clampDay(e.target.value),
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                              });
                            }}
                            className="w-full rounded-md border px-2 py-1"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            type="date"
                            value={meta.startDateISO}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                startDateISO: e.target.value || isoToday(),
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                              });
                            }}
                            className="w-full rounded-md border px-2 py-1"
                          />
                        </td>

                        <td className="p-2 font-mono">{meta.tierK * 1000}</td>

                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            value={Math.max(0, clampInt(meta.bonusPoints || 0))}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const bonusPoints = Math.max(
                                0,
                                clampInt(e.target.value || 0)
                              );
                              const next: ClubMeta = {
                                ...meta,
                                bonusPoints,
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                bonusMode: "TOTAL",
                                bonusValue: bonusPoints,
                                pointsFinal: calcItemPointsFinal({
                                  ...it,
                                  pointsBase: next.tierK * 1000,
                                  bonusMode: "TOTAL",
                                  bonusValue: bonusPoints,
                                }),
                              });
                            }}
                            className="w-full rounded-md border px-2 py-1"
                          />
                        </td>

                        <td className="p-2 font-mono">
                          {Math.max(0, clampInt(it.pointsFinal || 0)).toLocaleString("pt-BR")}
                        </td>

                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => removeItemByIndex(realIdx)}
                            disabled={!!isReleased}
                            className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-xs text-gray-600">
            Clubes são itens <b>CLUB</b>, entram no custo/total e o bônus em milhas soma no total de pontos do item.
          </div>
        </div>
      )}

      {/* 4) Itens (NOVO LAYOUT PROFISSIONAL) */}
      {draft && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-medium">4) Itens (pontos + custos)</h2>
              <div className="text-xs text-gray-500">
                Layout em cartões (não corta texto). Em telas grandes, fica bem
                alinhado.
              </div>
            </div>

            <button
              type="button"
              onClick={addTransferItem}
              disabled={!!isReleased}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              + Adicionar item
            </button>
          </div>

          {otherItems.length === 0 && (
            <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-600">
              Sem itens ainda.
            </div>
          )}

          {otherItems.length > 0 && (
            <div className="space-y-3">
              {(draft.items ?? []).map((it, realIdx) => {
                if (it.type === "CLUB") return null;

                const key = makeKey(it, realIdx);
                const allowManual = !!itemsAllowManualFinal[key];

                return (
                  <ItemCard
                    key={key}
                    it={it}
                    realIdx={realIdx}
                    allowManual={allowManual}
                    isReleased={!!isReleased}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItemByIndex}
                    onToggleAllowManual={(v) =>
                      setItemsAllowManualFinal((s) => ({ ...s, [key]: v }))
                    }
                  />
                );
              })}
            </div>
          )}

          <div className="text-xs text-gray-600">
            Para o milheiro: o cálculo usa o <b>Esperado</b> da CIA (LATAM/Smiles).
          </div>
        </div>
      )}

      {/* 5) Saldo esperado + CIA */}
      {draft && cedenteSel && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              5) Saldo final esperado (aplica no LIBERAR)
            </h2>
            <div className="text-xs text-gray-500">
              Auto = atual + deltas dos itens/clubes
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm text-gray-600">CIA base (milheiro)</label>
              <select
                value={draft.ciaProgram || ""}
                disabled={!!isReleased}
                onChange={(e) =>
                  updateDraft({
                    ciaProgram: (e.target.value || null) as LoyaltyProgram | null,
                  })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                <option value="LATAM">LATAM</option>
                <option value="SMILES">Smiles</option>
              </select>

              <div className="mt-2 text-xs text-gray-500">
                O milheiro usa o <b>Esperado</b> da CIA selecionada.
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-600">Pontos usados no milheiro</div>
              <div className="mt-1 text-sm font-semibold font-mono">
                {Math.max(0, pointsForMilheiro(draft)).toLocaleString("pt-BR")}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Base:{" "}
                {draft.ciaProgram === "LATAM"
                  ? "Esperado LATAM"
                  : draft.ciaProgram === "SMILES"
                  ? "Esperado Smiles"
                  : "—"}
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-600">Milheiro (pela CIA)</div>
              <div className="mt-1 text-sm font-semibold">
                {fmtMoneyBR(totals?.costPerKiloCents || 0)}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                (usa o <b>Esperado</b> da CIA)
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <ExpectedBalance
              label="LATAM"
              program="LATAM"
              current={cedenteSel.pontosLatam}
              delta={computedExpected?.deltas.LATAM || 0}
              value={draft.expectedLatamPoints}
              auto={expectedAuto.LATAM}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, LATAM: v }))}
              onChange={(v) => updateDraft({ expectedLatamPoints: v })}
            />
            <ExpectedBalance
              label="Smiles"
              program="SMILES"
              current={cedenteSel.pontosSmiles}
              delta={computedExpected?.deltas.SMILES || 0}
              value={draft.expectedSmilesPoints}
              auto={expectedAuto.SMILES}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, SMILES: v }))}
              onChange={(v) => updateDraft({ expectedSmilesPoints: v })}
            />
            <ExpectedBalance
              label="Livelo"
              program="LIVELO"
              current={cedenteSel.pontosLivelo}
              delta={computedExpected?.deltas.LIVELO || 0}
              value={draft.expectedLiveloPoints}
              auto={expectedAuto.LIVELO}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, LIVELO: v }))}
              onChange={(v) => updateDraft({ expectedLiveloPoints: v })}
            />
            <ExpectedBalance
              label="Esfera"
              program="ESFERA"
              current={cedenteSel.pontosEsfera}
              delta={computedExpected?.deltas.ESFERA || 0}
              value={draft.expectedEsferaPoints}
              auto={expectedAuto.ESFERA}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, ESFERA: v }))}
              onChange={(v) => updateDraft({ expectedEsferaPoints: v })}
            />
          </div>

          <div className="text-xs text-gray-600">
            Ao clicar em <b>LIBERAR</b>, os pontos do cedente serão atualizados para{" "}
            <b>esses saldos</b>.
          </div>
        </div>
      )}

      {draft && (
        <div className="text-xs text-gray-500">
          {saving ? "Salvando…" : "Autosave ativo (~0,65s ao editar)."}{" "}
          {draft.status === "CLOSED" ? "Compra liberada (travada)." : ""}
        </div>
      )}
    </div>
  );
}

function DraftActions(props: {
  draft: PurchaseDraft;
  saving: boolean;
  isReleased: boolean;
  onSave: () => void;
  onRelease: () => void;
}) {
  const { draft, saving, isReleased, onSave, onRelease } = props;

  const ptsMilheiro = pointsForMilheiro(draft);
  const releaseDisabled =
    isReleased || saving || !draft.ciaProgram || !ptsMilheiro || ptsMilheiro <= 0;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || isReleased}
        className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
      >
        Salvar
      </button>

      <button
        type="button"
        onClick={onRelease}
        disabled={releaseDisabled}
        className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        LIBERAR (aplicar saldo)
      </button>
    </div>
  );
}

function Row(props: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{props.label}</span>
      <span className={props.bold ? "font-semibold" : ""}>{props.value}</span>
    </div>
  );
}

function ExpectedBalance(props: {
  label: string;
  program: LoyaltyProgram;
  current: number;
  delta: number;
  value: number | null;
  auto: boolean;
  disabled?: boolean;
  onToggleAuto: (v: boolean) => void;
  onChange: (v: number | null) => void;
}) {
  const { label, current, delta, value, auto, disabled, onToggleAuto, onChange } =
    props;

  const signedDelta =
    delta === 0
      ? "0"
      : delta > 0
      ? `+${delta.toLocaleString("pt-BR")}`
      : `${delta.toLocaleString("pt-BR")}`;

  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        <label className="text-[11px] text-gray-600 flex items-center gap-2">
          <input
            type="checkbox"
            checked={auto}
            disabled={disabled}
            onChange={(e) => onToggleAuto(e.target.checked)}
          />
          Auto
        </label>
      </div>

      <div className="mt-1 text-xs text-gray-600">
        Atual: <b>{current.toLocaleString("pt-BR")}</b>
      </div>

      <div className="text-xs text-gray-600">
        Delta:{" "}
        <b className={delta >= 0 ? "text-emerald-700" : "text-red-700"}>
          {signedDelta}
        </b>
      </div>

      <label className="mt-2 block text-xs text-gray-600">Esperado</label>
      <input
        type="number"
        value={value ?? ""}
        disabled={disabled || auto}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? Math.trunc(n) : 0);
        }}
        className="mt-1 w-full rounded-md border px-2 py-2 text-sm disabled:opacity-50"
        placeholder="Ex: 150000"
      />
      {auto && (
        <div className="mt-1 text-[11px] text-gray-500">
          Calculado automaticamente.
        </div>
      )}
    </div>
  );
}

/* =========================
   NOVO: ItemCard (Etapa 4)
   ========================= */
function ItemCard(props: {
  it: PurchaseItem;
  realIdx: number;
  allowManual: boolean;
  isReleased: boolean;
  onUpdateItem: (realIdx: number, patch: Partial<PurchaseItem>) => void;
  onRemoveItem: (realIdx: number) => void;
  onToggleAllowManual: (v: boolean) => void;
}) {
  const { it, realIdx, allowManual, isReleased, onUpdateItem, onRemoveItem, onToggleAllowManual } =
    props;

  return (
    <div className="rounded-xl border bg-white p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px]">
          <label className="text-[11px] text-gray-600">Tipo</label>
          <select
            value={it.type}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, { type: e.target.value as PurchaseItemType })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="TRANSFER">Transferência</option>
            <option value="POINTS_BUY">Compra pontos</option>
            <option value="ADJUSTMENT">Ajuste</option>
            <option value="EXTRA_COST">Extra</option>
          </select>
        </div>

        <div className="flex-1 min-w-[280px]">
          <label className="text-[11px] text-gray-600">Título</label>
          <input
            value={it.title}
            disabled={isReleased}
            onChange={(e) => onUpdateItem(realIdx, { title: e.target.value })}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Ex: Transfer Livelo→Smiles"
          />

          <label className="mt-2 block text-[11px] text-gray-600">
            Detalhes (opcional)
          </label>
          <input
            value={it.details || ""}
            disabled={isReleased}
            onChange={(e) => onUpdateItem(realIdx, { details: e.target.value })}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Ex: Campanha 80%, ID do pedido, observações..."
          />
        </div>

        <div className="min-w-[200px]">
          <label className="text-[11px] text-gray-600">Custo (R$)</label>
          <input
            type="number"
            value={(it.amountCents || 0) / 100}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, {
                amountCents: roundCents(Number(e.target.value || 0) * 100),
              })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onRemoveItem(realIdx)}
              disabled={isReleased}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              Remover
            </button>
          </div>
        </div>
      </div>

      <div className="my-4 h-px bg-gray-100" />

      {/* Body grid */}
      <div className="grid gap-3 md:grid-cols-12">
        {/* De */}
        <div className="md:col-span-3">
          <label className="text-[11px] text-gray-600">De (origem)</label>
          <select
            value={it.programFrom || ""}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, {
                programFrom: (e.target.value || null) as any,
              })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="LATAM">LATAM</option>
            <option value="SMILES">SMILES</option>
            <option value="LIVELO">LIVELO</option>
            <option value="ESFERA">ESFERA</option>
          </select>
        </div>

        {/* Para */}
        <div className="md:col-span-3">
          <label className="text-[11px] text-gray-600">Para (destino)</label>
          <select
            value={it.programTo || ""}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, { programTo: (e.target.value || null) as any })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="LATAM">LATAM</option>
            <option value="SMILES">SMILES</option>
            <option value="LIVELO">LIVELO</option>
            <option value="ESFERA">ESFERA</option>
          </select>
        </div>

        {/* Base */}
        <div className="md:col-span-2">
          <label className="text-[11px] text-gray-600">Pontos base</label>
          <input
            type="number"
            value={it.pointsBase}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, { pointsBase: clampInt(e.target.value) })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
          />
        </div>

        {/* Bônus */}
        <div className="md:col-span-4">
          <label className="text-[11px] text-gray-600">Bônus</label>
          <div className="mt-1 flex gap-2">
            <select
              value={it.bonusMode || ""}
              disabled={isReleased}
              onChange={(e) =>
                onUpdateItem(realIdx, { bonusMode: e.target.value as any })
              }
              className="w-[120px] rounded-md border px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="PERCENT">%</option>
              <option value="TOTAL">+Pts</option>
            </select>

            <input
              type="number"
              value={it.bonusValue ?? 0}
              disabled={isReleased || !it.bonusMode}
              onChange={(e) =>
                onUpdateItem(realIdx, { bonusValue: clampInt(e.target.value) })
              }
              className="flex-1 rounded-md border px-3 py-2 text-sm font-mono disabled:opacity-50"
              placeholder="0"
            />
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            % calcula em cima da base · +Pts soma fixo
          </div>
        </div>

        {/* Final */}
        <div className="md:col-span-4">
          <label className="text-[11px] text-gray-600">Pontos final</label>
          <input
            type="number"
            value={it.pointsFinal}
            disabled={isReleased || !allowManual}
            onChange={(e) =>
              onUpdateItem(realIdx, { pointsFinal: clampInt(e.target.value) })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono disabled:opacity-50"
          />

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="text-[11px] text-gray-700 flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowManual}
                disabled={isReleased}
                onChange={(e) => onToggleAllowManual(e.target.checked)}
              />
              Permitir editar final
            </label>

            {!allowManual && (
              <span className="text-[11px] text-gray-500">
                auto (base + bônus)
              </span>
            )}
          </div>
        </div>

        {/* Debitado origem */}
        <div className="md:col-span-4">
          <label className="text-[11px] text-gray-600">Debitado na origem</label>
          <input
            type="number"
            value={it.pointsDebitedFromOrigin}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, {
                pointsDebitedFromOrigin: clampInt(e.target.value),
              })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
            placeholder="0"
          />
          <div className="mt-1 text-[11px] text-gray-500">
            Se o destino recebe e a origem perde, preencha aqui.
          </div>
        </div>

        {/* Modo */}
        <div className="md:col-span-4">
          <label className="text-[11px] text-gray-600">Modo</label>
          <select
            value={it.transferMode || ""}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, {
                transferMode: (e.target.value || null) as any,
              })
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="FULL_POINTS">Só pontos</option>
            <option value="POINTS_PLUS_CASH">Pontos + dinheiro</option>
          </select>
          <div className="mt-1 text-[11px] text-gray-500">
            Use para registrar a forma do resgate/transferência.
          </div>
        </div>

        {/* Quick summary */}
        <div className="md:col-span-4">
          <label className="text-[11px] text-gray-600">Resumo rápido</label>
          <div className="mt-1 rounded-md border bg-gray-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Final</span>
              <span className="font-mono font-semibold">
                {clampInt(it.pointsFinal).toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-gray-600">Custo</span>
              <span className="font-semibold">{fmtMoneyBR(it.amountCents || 0)}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              {it.programFrom ? PROGRAM_LABEL[it.programFrom] : "—"} →{" "}
              {it.programTo ? PROGRAM_LABEL[it.programTo] : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
