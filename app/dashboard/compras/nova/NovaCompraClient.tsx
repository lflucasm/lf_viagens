"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
};

type PurchaseItemType = "CLUB" | "POINTS_BUY";

type PurchaseItem = {
  id?: string;
  type: PurchaseItemType;
  title: string;
  details?: string | null;
  programFrom?: LoyaltyProgram | null;
  programTo?: LoyaltyProgram | null;
  pointsBase: number;
  bonusMode?: "PERCENT" | "TOTAL" | "" | null;
  bonusValue?: number | null;
  pointsFinal: number;
  transferMode?: null;
  pointsDebitedFromOrigin: number;
  amountCents: number;
};

type ClubMonthRow = { program: LoyaltyProgram; points: number };

type ClubMeta = {
  program: LoyaltyProgram;
  tierK: number;
  priceCents: number;
  renewalDay: number;
  startDateISO: string;
  bonusPoints: number;
  isRecurrent?: boolean;
  billingCycle?: "MONTHLY" | "ANNUAL";
  /** Cada linha = um mês de crédito; programa e pontos podem variar (ex.: meses já usados fora do cronograma). */
  monthSchedule?: { program: LoyaltyProgram; points: number }[];
  monthlyPointsMode?: "FROM_TIER" | "CUSTOM";
  customMonthlyPoints?: number;
};

type PurchaseDraft = {
  id: string;
  numero: string;
  status: string;
  cedenteId: string;
  ciaProgram: LoyaltyProgram | null;
  ciaPointsTotal: number;
  note: string | null;
  items: PurchaseItem[];
  expectedLatamPoints: number | null;
  expectedSmilesPoints: number | null;
  expectedLiveloPoints: number | null;
  expectedEsferaPoints: number | null;
  totalCostCents: number;
  costPerKiloCents: number;
};

const PROGRAM_LABEL: Record<LoyaltyProgram, string> = {
  LATAM: "LATAM",
  SMILES: "Smiles",
  LIVELO: "Livelo",
  ESFERA: "Esfera",
};

const CLUB_TIERS = [1, 2, 3, 5, 7, 10, 12, 15, 20];

function clampInt(n: unknown) {
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

function clampDay(n: unknown) {
  const x = clampInt(n);
  if (x <= 0) return 1;
  if (x > 31) return 31;
  return x;
}

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcItemPointsFinal(item: {
  pointsBase: number;
  bonusMode?: string | null;
  bonusValue?: number | null;
}) {
  const base = clampInt(item.pointsBase);
  const mode = item.bonusMode || "";
  const val = item.bonusValue ?? 0;
  if (!mode) return base;
  if (mode === "PERCENT") {
    const pct = Math.max(0, clampInt(val));
    return base + Math.round((base * pct) / 100);
  }
  if (mode === "TOTAL") return base + Math.max(0, clampInt(val));
  return base;
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

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text().catch(() => "");
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok || data?.ok === false) {
    throw new Error(String(data?.error || `Erro ${res.status}`));
  }
  return data as T;
}

function buildExpected(
  c: Cedente,
  program: LoyaltyProgram,
  deltaPts: number
): Pick<
  PurchaseDraft,
  | "expectedLatamPoints"
  | "expectedSmilesPoints"
  | "expectedLiveloPoints"
  | "expectedEsferaPoints"
> {
  return {
    expectedLatamPoints:
      program === "LATAM" ? c.pontosLatam + deltaPts : c.pontosLatam,
    expectedSmilesPoints:
      program === "SMILES" ? c.pontosSmiles + deltaPts : c.pontosSmiles,
    expectedLiveloPoints:
      program === "LIVELO" ? c.pontosLivelo + deltaPts : c.pontosLivelo,
    expectedEsferaPoints:
      program === "ESFERA" ? c.pontosEsfera + deltaPts : c.pontosEsfera,
  };
}

function normalizeProgramRow(s: unknown): LoyaltyProgram {
  const u = String(s || "").toUpperCase();
  if (u === "LATAM" || u === "SMILES" || u === "LIVELO" || u === "ESFERA") return u;
  return "LATAM";
}

function buildExpectedFromSchedule(
  c: Cedente,
  rows: ClubMonthRow[]
): Pick<
  PurchaseDraft,
  | "expectedLatamPoints"
  | "expectedSmilesPoints"
  | "expectedLiveloPoints"
  | "expectedEsferaPoints"
> {
  let lat = c.pontosLatam;
  let smi = c.pontosSmiles;
  let liv = c.pontosLivelo;
  let esf = c.pontosEsfera;
  for (const r of rows) {
    const n = Math.max(0, clampInt(r.points));
    if (n <= 0) continue;
    if (r.program === "LATAM") lat += n;
    else if (r.program === "SMILES") smi += n;
    else if (r.program === "LIVELO") liv += n;
    else if (r.program === "ESFERA") esf += n;
  }
  return {
    expectedLatamPoints: lat,
    expectedSmilesPoints: smi,
    expectedLiveloPoints: liv,
    expectedEsferaPoints: esf,
  };
}

function mapItemToApi(it: PurchaseItem) {
  return {
    type: it.type,
    title: it.title,
    details: it.details ?? null,
    programFrom: it.programFrom ?? null,
    programTo: it.programTo ?? null,
    pointsBase: it.pointsBase,
    bonusMode: it.bonusMode ?? null,
    bonusValue: it.bonusValue ?? null,
    pointsFinal: it.pointsFinal,
    transferMode: null,
    pointsDebitedFromOrigin: it.pointsDebitedFromOrigin,
    amountCents: it.amountCents,
  };
}

export default function NovaCompraClient({ purchaseId }: { purchaseId?: string }) {
  const params = useParams() as Record<string, string | string[] | undefined>;
  const routeIdRaw = params?.id;
  const routeId = Array.isArray(routeIdRaw) ? routeIdRaw[0] : routeIdRaw;
  const purchaseIdFinal = purchaseId || routeId;
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [allCedentes, setAllCedentes] = useState<Cedente[]>([]);
  const [cedenteSel, setCedenteSel] = useState<Cedente | null>(null);
  const [loadingCed, setLoadingCed] = useState(false);

  const [program, setProgram] = useState<LoyaltyProgram | "">("");
  const [tipo, setTipo] = useState<"PONTOS" | "CLUBE">("PONTOS");

  const [pointsBase, setPointsBase] = useState(0);
  const [bonusMode, setBonusMode] = useState<"" | "PERCENT" | "TOTAL">("");
  const [bonusValue, setBonusValue] = useState(0);
  const [valorReais, setValorReais] = useState("");

  const [tierK, setTierK] = useState(10);
  const [clubPriceReais, setClubPriceReais] = useState("");
  const [renewalDay, setRenewalDay] = useState(10);
  const [startDateISO, setStartDateISO] = useState(isoToday());
  const [clubBonusPts, setClubBonusPts] = useState(0);
  const [clubRecurrent, setClubRecurrent] = useState(true);
  const [clubBilling, setClubBilling] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [clubMonthRows, setClubMonthRows] = useState<ClubMonthRow[]>([]);
  const [clubFillN, setClubFillN] = useState(3);

  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [multiItemWarning, setMultiItemWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingCed(true);
      try {
        const out = await api<{ ok: true; data: Cedente[] }>("/api/cedentes/approved");
        if (!alive) return;
        setAllCedentes(Array.isArray(out?.data) ? out.data : []);
      } catch {
        if (alive) setAllCedentes([]);
      } finally {
        if (alive) setLoadingCed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!purchaseIdFinal) return;
    (async () => {
      try {
        setSaving(true);
        const out = await api<{ compra: Record<string, unknown>; cedente: Cedente }>(
          `/api/compras/${purchaseIdFinal}`
        );
        setCedenteSel(out.cedente);
        const raw = out.compra;
        const items = (Array.isArray(raw.items) ? raw.items : []) as PurchaseItem[];
        setMultiItemWarning(items.length > 1);
        const p0 = String(raw.ciaProgram || raw.ciaAerea || "");
        if (p0 === "LATAM" || p0 === "SMILES" || p0 === "LIVELO" || p0 === "ESFERA") {
          setProgram(p0);
        }
        setDraft({
          id: String(raw.id || ""),
          numero: String(raw.numero || ""),
          status: String(raw.status || "OPEN"),
          cedenteId: String(raw.cedenteId || ""),
          ciaProgram: (raw.ciaProgram || raw.ciaAerea || null) as LoyaltyProgram | null,
          ciaPointsTotal: clampInt(raw.ciaPointsTotal ?? raw.pontosCiaTotal ?? 0),
          note: (raw.note as string) ?? (raw.observacao as string) ?? null,
          items,
          expectedLatamPoints: (raw.expectedLatamPoints ?? raw.saldoPrevistoLatam) as number | null,
          expectedSmilesPoints: (raw.expectedSmilesPoints ?? raw.saldoPrevistoSmiles) as number | null,
          expectedLiveloPoints: (raw.expectedLiveloPoints ?? raw.saldoPrevistoLivelo) as number | null,
          expectedEsferaPoints: (raw.expectedEsferaPoints ?? raw.saldoPrevistoEsfera) as number | null,
          totalCostCents: clampInt(raw.totalCostCents ?? raw.totalCents ?? 0),
          costPerKiloCents: clampInt(raw.costPerKiloCents ?? raw.custoMilheiroCents ?? 0),
        });
        setNote(String((raw.note as string) || (raw.observacao as string) || ""));

        const first = items[0];
        if (first?.type === "POINTS_BUY") {
          setTipo("PONTOS");
          setClubMonthRows([]);
          setPointsBase(clampInt(first.pointsBase));
          setBonusMode((first.bonusMode as "" | "PERCENT" | "TOTAL") || "");
          setBonusValue(clampInt(first.bonusValue ?? 0));
          setValorReais(String((clampInt(first.amountCents) || 0) / 100));
        } else if (first?.type === "CLUB") {
          setTipo("CLUBE");
          try {
            const m = JSON.parse(String(first.details || "{}")) as ClubMeta;
            setTierK(clampInt(m.tierK) || 10);
            setClubPriceReais(String((clampInt(m.priceCents) || 0) / 100));
            setRenewalDay(clampDay(m.renewalDay));
            setStartDateISO(m.startDateISO || isoToday());
            setClubBonusPts(Math.max(0, clampInt(m.bonusPoints)));
            setClubRecurrent(m.isRecurrent !== false);
            setClubBilling(m.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY");
            if (Array.isArray(m.monthSchedule) && m.monthSchedule.length > 0) {
              setClubMonthRows(
                m.monthSchedule.map((row) => ({
                  program: normalizeProgramRow(row.program),
                  points: Math.max(0, clampInt(row.points)),
                }))
              );
            } else {
              const defProg = normalizeProgramRow(m.program || p0);
              setClubMonthRows([
                { program: defProg, points: Math.max(0, clampInt(first.pointsFinal)) },
              ]);
            }
          } catch {
            /* ignore */
          }
        } else {
          setClubMonthRows([]);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Falha ao carregar compra.");
      } finally {
        setSaving(false);
      }
    })();
  }, [purchaseIdFinal]);

  useEffect(() => {
    if (tipo !== "CLUBE" || !draft?.id || draft.status === "CLOSED") return;
    setClubMonthRows((prev) => {
      if (prev.length > 0) return prev;
      if (!program) return prev;
      const p = program as LoyaltyProgram;
      return [{ program: p, points: tierK * 1000 + clubBonusPts }];
    });
  }, [tipo, draft?.id, draft?.status, program, tierK, clubBonusPts]);

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

  const itemPreview = useMemo((): PurchaseItem | null => {
    if (!cedenteSel) return null;

    if (tipo === "PONTOS") {
      if (!program) return null;
      const amountCents = roundCents(Number(valorReais.replace(",", ".") || 0) * 100);
      const pf = calcItemPointsFinal({
        pointsBase,
        bonusMode: bonusMode || null,
        bonusValue,
      });
      return {
        type: "POINTS_BUY",
        title: `Compra ${PROGRAM_LABEL[program]}`,
        programTo: program,
        programFrom: null,
        pointsBase,
        bonusMode: bonusMode || null,
        bonusValue,
        pointsFinal: pf,
        pointsDebitedFromOrigin: 0,
        amountCents,
      };
    }

    if (tipo !== "CLUBE") return null;

    const priceCents = roundCents(Number(clubPriceReais.replace(",", ".") || 0) * 100);
    const monthSchedule = clubMonthRows
      .map((r) => ({
        program: r.program,
        points: Math.max(0, clampInt(r.points)),
      }))
      .filter((r) => r.points > 0);
    const sumPts = monthSchedule.reduce((s, r) => s + r.points, 0);
    if (sumPts <= 0) return null;
    const primaryProgram = monthSchedule[0]!.program;
    const meta: ClubMeta = {
      program: primaryProgram,
      tierK,
      priceCents,
      renewalDay: clampDay(renewalDay),
      startDateISO,
      bonusPoints: clubBonusPts,
      isRecurrent: clubRecurrent,
      billingCycle: clubBilling,
      monthSchedule,
    };
    return {
      type: "CLUB",
      title:
        monthSchedule.length === 1
          ? `Clube ${PROGRAM_LABEL[primaryProgram]} (${monthSchedule.length} mês)`
          : `Clube · ${monthSchedule.length} meses (multi-programa)`,
      details: JSON.stringify(meta),
      programTo: primaryProgram,
      programFrom: null,
      pointsBase: monthSchedule[0]?.points ?? 0,
      bonusMode: "TOTAL",
      bonusValue: clubBonusPts,
      pointsFinal: sumPts,
      pointsDebitedFromOrigin: 0,
      amountCents: priceCents,
    };
  }, [
    cedenteSel,
    program,
    tipo,
    pointsBase,
    bonusMode,
    bonusValue,
    valorReais,
    tierK,
    clubPriceReais,
    renewalDay,
    startDateISO,
    clubBonusPts,
    clubRecurrent,
    clubBilling,
    clubMonthRows,
  ]);

  const expectedPreview = useMemo(() => {
    if (!cedenteSel || !itemPreview) return null;
    if (tipo === "PONTOS") {
      if (!program) return null;
      return buildExpected(cedenteSel, program as LoyaltyProgram, itemPreview.pointsFinal);
    }
    return buildExpectedFromSchedule(cedenteSel, clubMonthRows);
  }, [cedenteSel, program, itemPreview, tipo, clubMonthRows]);

  const milheiroEstimado = useMemo(() => {
    if (!itemPreview || itemPreview.pointsFinal <= 0) return 0;
    return Math.round((itemPreview.amountCents * 1000) / itemPreview.pointsFinal);
  }, [itemPreview]);

  const clubResumoExtra = useMemo(() => {
    if (!itemPreview || itemPreview.type !== "CLUB") return null;
    let meta: ClubMeta;
    try {
      meta = JSON.parse(String(itemPreview.details || "{}")) as ClubMeta;
    } catch {
      return null;
    }
    const sched = meta.monthSchedule || [];
    const byProgram: Partial<Record<LoyaltyProgram, number>> = {};
    for (const row of sched) {
      const p = row.program;
      byProgram[p] = (byProgram[p] || 0) + row.points;
    }
    const totalPaid = itemPreview.amountCents;
    const n = sched.length;
    const rateio =
      n > 0 && totalPaid > 0 ? Math.round(totalPaid / n) : 0;
    return {
      monthCount: n,
      renewalDay: meta.renewalDay,
      billing: meta.billingCycle,
      totalPaid,
      rateioPorMes: rateio,
      byProgram,
    };
  }, [itemPreview]);

  async function iniciarCompraPontos() {
    if (!cedenteSel || !program) {
      setError("Selecione o cedente, o programa e o tipo (compra ou clube).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const out = await api<{ compra: { id: string } }>("/api/compras", {
        method: "POST",
        body: JSON.stringify({
          cedenteId: cedenteSel.id,
          ciaProgram: program,
          note: note.trim() || null,
        }),
      });
      const id = out?.compra?.id;
      if (!id) throw new Error("Resposta inválida.");
      router.replace(`/dashboard/compras/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao criar.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft(silent?: boolean): Promise<boolean> {
    const primaryProgram =
      tipo === "CLUBE"
        ? clubMonthRows.find((r) => r.points > 0)?.program ?? program
        : program;
    if (!draft?.id || !cedenteSel || !itemPreview || !primaryProgram || !expectedPreview)
      return false;
    if (itemPreview.pointsFinal <= 0) return false;
    if (tipo === "PONTOS" && itemPreview.amountCents <= 0) return false;
    if (tipo === "CLUBE" && itemPreview.amountCents < 0) return false;
    if (!silent) setSaving(true);
    setError(null);
    try {
      const items = [mapItemToApi(itemPreview)];
      const payload = {
        ciaProgram: primaryProgram,
        ciaPointsTotal: itemPreview.pointsFinal,
        note: note.trim() || null,
        expectedLatamPoints: expectedPreview.expectedLatamPoints,
        expectedSmilesPoints: expectedPreview.expectedSmilesPoints,
        expectedLiveloPoints: expectedPreview.expectedLiveloPoints,
        expectedEsferaPoints: expectedPreview.expectedEsferaPoints,
        items,
      };
      const out = await api<{ compra: Record<string, unknown>; cedente: Cedente }>(
        `/api/compras/${draft.id}`,
        { method: "PATCH", body: JSON.stringify(payload) }
      );
      const raw = out.compra;
      setCedenteSel(out.cedente);
      setDraft({
        id: String(raw.id || draft.id),
        numero: String(raw.numero || ""),
        status: String(raw.status || "OPEN"),
        cedenteId: String(raw.cedenteId || ""),
        ciaProgram: (raw.ciaProgram || primaryProgram) as LoyaltyProgram,
        ciaPointsTotal: clampInt(raw.ciaPointsTotal ?? itemPreview.pointsFinal),
        note: (raw.note as string) ?? note,
        items: (raw.items as PurchaseItem[]) || items,
        expectedLatamPoints: expectedPreview.expectedLatamPoints,
        expectedSmilesPoints: expectedPreview.expectedSmilesPoints,
        expectedLiveloPoints: expectedPreview.expectedLiveloPoints,
        expectedEsferaPoints: expectedPreview.expectedEsferaPoints,
        totalCostCents: clampInt(raw.totalCostCents ?? raw.totalCents ?? itemPreview.amountCents),
        costPerKiloCents: clampInt(raw.costPerKiloCents ?? raw.custoMilheiroCents ?? milheiroEstimado),
      });
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
      return false;
    } finally {
      if (!silent) setSaving(false);
    }
  }

  async function liberar() {
    if (!draft?.id || !expectedPreview) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveDraft(true);
      if (!saved) {
        setError("Preencha pontos e valores antes de liberar.");
        return;
      }
      await api(`/api/compras/${draft.id}/liberar`, {
        method: "POST",
        body: JSON.stringify({
          saldosAplicados: {
            latam: expectedPreview.expectedLatamPoints ?? undefined,
            smiles: expectedPreview.expectedSmilesPoints ?? undefined,
            livelo: expectedPreview.expectedLiveloPoints ?? undefined,
            esfera: expectedPreview.expectedEsferaPoints ?? undefined,
          },
        }),
      });
      router.push("/dashboard/compras");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao liberar.");
    } finally {
      setSaving(false);
    }
  }

  const isClosed = draft?.status === "CLOSED";
  const canLiberar =
    !!draft?.id &&
    !isClosed &&
    !!itemPreview &&
    itemPreview.pointsFinal > 0 &&
    (tipo === "CLUBE" ? itemPreview.amountCents >= 0 : itemPreview.amountCents > 0) &&
    (tipo === "CLUBE" ? clubMonthRows.some((r) => r.points > 0) : !!program);

  if (purchaseIdFinal && !draft && !error) {
    return (
      <div className="grid min-h-[30vh] place-items-center text-sm text-gray-600">
        Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Efetuar compra</h1>
          <p className="text-sm text-gray-600">
            <b>1)</b> Cedente · <b>2)</b> Programa em que os pontos entram · <b>3)</b> Compra de pontos
            ou clube. Depois informe valores e libere o saldo. O milheiro vem do custo ÷ pontos.
          </p>
          {draft && (
            <div className="mt-2 text-xs text-gray-500">
              {isClosed ? (
                <span className="text-emerald-700 font-medium">Liberada</span>
              ) : (
                <>
                  Compra em edição · programa{" "}
                  <b>{draft.ciaProgram ? PROGRAM_LABEL[draft.ciaProgram] : "—"}</b>
                </>
              )}
            </div>
          )}
        </div>
        {draft && !isClosed && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              Salvar agora
            </button>
            <button
              type="button"
              onClick={() => void liberar()}
              disabled={!canLiberar || saving}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Liberar (aplicar saldo)
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {multiItemWarning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Esta compra tem mais de um lançamento. Ao <b>Salvar</b>, tudo será substituído por{" "}
          <b>um único</b> item conforme o formulário abaixo.
        </div>
      )}

      {/* Cedente */}
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium">
          <span className="text-gray-400 font-normal text-sm mr-2">1.</span>Cedente
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!!draft?.id && isClosed}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Buscar nome, CPF ou identificador…"
        />
        {loadingCed && <div className="text-xs text-gray-500">Carregando…</div>}
        {!draft?.id && query.trim().length >= 2 && cedentes.length > 0 && (
          <div className="max-h-48 overflow-auto rounded-md border">
            {cedentes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCedenteSel(c)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  cedenteSel?.id === c.id ? "bg-gray-50" : ""
                }`}
              >
                <span className="font-medium">{c.nomeCompleto}</span>
                <span className="text-xs text-gray-500">
                  {c.identificador} · CPF {c.cpf}
                </span>
              </button>
            ))}
          </div>
        )}
        {cedenteSel && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <div className="font-medium">{cedenteSel.nomeCompleto}</div>
            <div className="text-xs text-gray-600 mt-1">
              LATAM {cedenteSel.pontosLatam.toLocaleString("pt-BR")} · SMILES{" "}
              {cedenteSel.pontosSmiles.toLocaleString("pt-BR")} · LIVELO{" "}
              {cedenteSel.pontosLivelo.toLocaleString("pt-BR")} · ESFERA{" "}
              {cedenteSel.pontosEsfera.toLocaleString("pt-BR")}
            </div>
          </div>
        )}
      </div>

      {/* Programa */}
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium">
          <span className="text-gray-400 font-normal text-sm mr-2">2.</span>Programa
        </h2>
        <p className="text-xs text-gray-500">
          Em <b>compra de pontos</b>, o programa único da operação. Em <b>clube</b>, use-o como padrão ao
          adicionar linhas no cronograma — cada mês pode ser LATAM, Smiles, Livelo ou Esfera.
        </p>
        <label className="block text-sm">
          <span className="text-gray-600">Programa</span>
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value as LoyaltyProgram | "")}
            disabled={!cedenteSel || !!draft?.id || isClosed}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">
              {cedenteSel ? "Selecione o programa…" : "Primeiro selecione um cedente"}
            </option>
            {(Object.keys(PROGRAM_LABEL) as LoyaltyProgram[]).map((p) => (
              <option key={p} value={p}>
                {PROGRAM_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Tipo: compra vs clube */}
      {cedenteSel && program && (
        <div className="rounded-xl border p-4 space-y-4">
          <h2 className="font-medium">
            <span className="text-gray-400 font-normal text-sm mr-2">3.</span>Tipo de lançamento
          </h2>
          <p className="text-xs text-gray-500">
            Compra avulsa de pontos ou assinatura de clube no programa escolhido.
          </p>
          <div className="text-sm">
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "PONTOS"}
                  disabled={!!draft?.id || isClosed}
                  onChange={() => setTipo("PONTOS")}
                />
                Compra de pontos
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "CLUBE"}
                  disabled={!!draft?.id || isClosed}
                  onChange={() => setTipo("CLUBE")}
                />
                Clube
              </label>
            </div>
          </div>

          {!draft?.id && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void iniciarCompraPontos()}
                disabled={saving}
                className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {tipo === "CLUBE" ? "Registrar clube" : "Adicionar pontos"}
              </button>
              <p className="text-xs text-gray-500">
                Abre a etapa de valores (pontos ou pacote de clube). Depois use <b>Salvar agora</b> e{" "}
                <b>Liberar</b> para aplicar o saldo no cedente.
              </p>
            </div>
          )}
        </div>
      )}

      {draft?.id && !isClosed && (
        <>
          <div className="rounded-xl border p-4 space-y-4">
            <h2 className="font-medium">Valores</h2>
            {tipo === "PONTOS" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="text-gray-600">Pontos base</span>
                  <input
                    type="number"
                    value={pointsBase || ""}
                    onChange={(e) => setPointsBase(clampInt(e.target.value))}
                    className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Valor pago (R$)</span>
                  <input
                    value={valorReais}
                    onChange={(e) => setValorReais(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="0,00"
                  />
                </label>
                <div className="md:col-span-2 grid gap-2 md:grid-cols-2">
                  <label className="text-sm">
                    <span className="text-gray-600">Bônus</span>
                    <select
                      value={bonusMode}
                      onChange={(e) =>
                        setBonusMode(e.target.value as "" | "PERCENT" | "TOTAL")
                      }
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="">Nenhum</option>
                      <option value="PERCENT">Percentual sobre a base</option>
                      <option value="TOTAL">Pontos fixos extras</option>
                    </select>
                  </label>
                  {bonusMode ? (
                    <label className="text-sm">
                      <span className="text-gray-600">
                        {bonusMode === "PERCENT" ? "Percentual (%)" : "Pontos extras"}
                      </span>
                      <input
                        type="number"
                        value={bonusValue || ""}
                        onChange={(e) => setBonusValue(clampInt(e.target.value))}
                        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-600">
                  Monte o <b>cronograma</b>: uma linha por mês que ainda vai cair (omitindo meses já creditados).
                  Cada linha tem programa próprio e quantidade de milhas.
                </p>
                <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-gray-50/80 p-3">
                  <label className="text-sm">
                    <span className="text-gray-600">Pacote base (k/mês)</span>
                    <select
                      value={tierK}
                      onChange={(e) => setTierK(clampInt(e.target.value))}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-white"
                    >
                      {CLUB_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {t}k
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Bônus no padrão</span>
                    <input
                      type="number"
                      value={clubBonusPts || ""}
                      onChange={(e) => setClubBonusPts(Math.max(0, clampInt(e.target.value)))}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-white"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Replicar padrão em N meses</span>
                    <input
                      type="number"
                      min={1}
                      max={36}
                      value={clubFillN || ""}
                      onChange={(e) => setClubFillN(Math.max(1, Math.min(36, clampInt(e.target.value))))}
                      className="mt-1 w-24 rounded-md border px-3 py-2 text-sm bg-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const p = (program || clubMonthRows[0]?.program || "LATAM") as LoyaltyProgram;
                      const pts = tierK * 1000 + clubBonusPts;
                      setClubMonthRows(
                        Array.from({ length: Math.max(1, clubFillN) }, () => ({
                          program: p,
                          points: pts,
                        }))
                      );
                    }}
                    className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Aplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = (program || clubMonthRows[clubMonthRows.length - 1]?.program || "LATAM") as LoyaltyProgram;
                      setClubMonthRows((s) => [
                        ...s,
                        { program: p, points: tierK * 1000 + clubBonusPts },
                      ]);
                    }}
                    className="rounded-md bg-black px-3 py-2 text-sm text-white"
                  >
                    + Mês
                  </button>
                </div>

                <div className="overflow-auto rounded-lg border">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="p-2 w-16">#</th>
                        <th className="p-2">Programa</th>
                        <th className="p-2">Pontos</th>
                        <th className="p-2 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {clubMonthRows.map((row, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 text-gray-500">{idx + 1}</td>
                          <td className="p-2">
                            <select
                              value={row.program}
                              onChange={(e) => {
                                const v = e.target.value as LoyaltyProgram;
                                setClubMonthRows((s) => {
                                  const n = [...s];
                                  n[idx] = { ...n[idx], program: v };
                                  return n;
                                });
                              }}
                              className="w-full rounded-md border px-2 py-1.5 text-sm"
                            >
                              {(Object.keys(PROGRAM_LABEL) as LoyaltyProgram[]).map((p) => (
                                <option key={p} value={p}>
                                  {PROGRAM_LABEL[p]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              className="w-full rounded-md border px-2 py-1.5 font-mono text-sm"
                              value={row.points || ""}
                              onChange={(e) => {
                                const v = Math.max(0, clampInt(e.target.value));
                                setClubMonthRows((s) => {
                                  const n = [...s];
                                  n[idx] = { ...n[idx], points: v };
                                  return n;
                                });
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <button
                              type="button"
                              disabled={clubMonthRows.length <= 1}
                              onClick={() =>
                                setClubMonthRows((s) => s.filter((_, j) => j !== idx))
                              }
                              className="text-xs text-red-700 disabled:opacity-40"
                            >
                              remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    <span className="text-gray-600">Preço total (R$)</span>
                    <input
                      value={clubPriceReais}
                      onChange={(e) => setClubPriceReais(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Dia renovação</span>
                    <input
                      type="number"
                      value={renewalDay}
                      onChange={(e) => setRenewalDay(clampDay(e.target.value))}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Início (referência)</span>
                    <input
                      type="date"
                      value={startDateISO}
                      onChange={(e) => setStartDateISO(e.target.value || isoToday())}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="text-sm space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={clubRecurrent}
                        onChange={(e) => setClubRecurrent(e.target.checked)}
                      />
                      Assinatura recorrente
                    </label>
                    {clubRecurrent && (
                      <select
                        value={clubBilling}
                        onChange={(e) =>
                          setClubBilling(e.target.value as "MONTHLY" | "ANNUAL")
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="MONTHLY">Cobrança mensal (referência)</option>
                        <option value="ANNUAL">Cobrança anual (referência)</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )}

            <label className="block text-sm">
              <span className="text-gray-600">Observação</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
            <div className="font-medium">Resumo</div>
            {itemPreview && cedenteSel && (tipo === "PONTOS" ? !!program : true) ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {tipo === "CLUBE" ? "Total pontos (soma do cronograma)" : "Pontos no programa"}
                  </span>
                  <b className="font-mono">
                    +{itemPreview.pointsFinal.toLocaleString("pt-BR")}
                    {tipo === "PONTOS" && program
                      ? ` ${PROGRAM_LABEL[program as LoyaltyProgram]}`
                      : tipo === "CLUBE"
                        ? " · multi-programa"
                        : ""}
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {tipo === "CLUBE" && clubBilling === "ANNUAL" ? "Valor pago (referência anual)" : "Custo"}
                  </span>
                  <b>{fmtMoneyBR(itemPreview.amountCents)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Milheiro (custo ÷ pts totais)</span>
                  <b>{milheiroEstimado > 0 ? fmtMoneyBR(milheiroEstimado) : "—"}</b>
                </div>
                {tipo === "CLUBE" && clubResumoExtra ? (
                  <div className="text-xs space-y-2 border-t pt-3 mt-1 text-gray-700">
                    <div>
                      <b>{clubResumoExtra.monthCount}</b>{" "}
                      {clubResumoExtra.monthCount === 1 ? "mês" : "meses"} · Renovação dia{" "}
                      <b>{clubResumoExtra.renewalDay}</b>
                    </div>
                    {clubResumoExtra.billing === "ANNUAL" ? (
                      <div>
                        Pagamento anual: <b>{fmtMoneyBR(clubResumoExtra.totalPaid)}</b> (~
                        <b>{fmtMoneyBR(clubResumoExtra.rateioPorMes)}</b>/mês rateado em {clubResumoExtra.monthCount || 1}{" "}
                        meses)
                      </div>
                    ) : (
                      <div>
                        Referência mensal: <b>{fmtMoneyBR(clubResumoExtra.totalPaid)}</b>
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-gray-800 mb-1">Pontos por programa</div>
                      <div className="space-y-0.5 font-mono">
                        {(Object.keys(PROGRAM_LABEL) as LoyaltyProgram[]).map((p) => {
                          const v = clubResumoExtra.byProgram[p];
                          if (!v) return null;
                          return (
                            <div key={p} className="flex justify-between gap-4">
                              <span>{PROGRAM_LABEL[p]}</span>
                              <span>+{v.toLocaleString("pt-BR")}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="text-xs text-gray-600 pt-2 border-t space-y-0.5">
                  <div className="font-medium text-gray-700">Saldos atuais</div>
                  <div className="grid grid-cols-2 gap-x-2 font-mono">
                    <span>LATAM</span>
                    <span className="text-right">{cedenteSel.pontosLatam.toLocaleString("pt-BR")}</span>
                    <span>Smiles</span>
                    <span className="text-right">{cedenteSel.pontosSmiles.toLocaleString("pt-BR")}</span>
                    <span>Livelo</span>
                    <span className="text-right">{cedenteSel.pontosLivelo.toLocaleString("pt-BR")}</span>
                    <span>Esfera</span>
                    <span className="text-right">{cedenteSel.pontosEsfera.toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                {expectedPreview && (
                  <div className="text-xs text-emerald-900 pt-2 border-t space-y-1">
                    <div className="font-medium">Após liberar</div>
                    <div className="grid grid-cols-2 gap-x-2 font-mono">
                      <span>LATAM</span>
                      <span className="text-right">
                        {expectedPreview.expectedLatamPoints?.toLocaleString("pt-BR")}
                      </span>
                      <span>Smiles</span>
                      <span className="text-right">
                        {expectedPreview.expectedSmilesPoints?.toLocaleString("pt-BR")}
                      </span>
                      <span>Livelo</span>
                      <span className="text-right">
                        {expectedPreview.expectedLiveloPoints?.toLocaleString("pt-BR")}
                      </span>
                      <span>Esfera</span>
                      <span className="text-right">
                        {expectedPreview.expectedEsferaPoints?.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500">Preencha programa e valores.</p>
            )}
          </div>
        </>
      )}

      {isClosed && (
        <p className="text-sm text-emerald-700">
          Esta compra já foi liberada. Volte para a lista de compras.
        </p>
      )}

      <p className="text-xs text-gray-500">
        {saving ? "Salvando…" : ""}
        {draft?.id && !isClosed ? (
          <>
            {" "}
            Use <b>Salvar agora</b> antes de liberar.{" "}
          </>
        ) : null}
        Transferências entre programas:{" "}
        <a href="/dashboard/compras/transferir" className="underline text-blue-700">
          Transferir pontos
        </a>
        .
      </p>
    </div>
  );
}
