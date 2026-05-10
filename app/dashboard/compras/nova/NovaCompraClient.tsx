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

type ClubMeta = {
  program: LoyaltyProgram;
  tierK: number;
  priceCents: number;
  renewalDay: number;
  startDateISO: string;
  bonusPoints: number;
  isRecurrent?: boolean;
  billingCycle?: "MONTHLY" | "ANNUAL";
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

function pointsOnCedente(c: Cedente, p: LoyaltyProgram): number {
  if (p === "LATAM") return c.pontosLatam;
  if (p === "SMILES") return c.pontosSmiles;
  if (p === "LIVELO") return c.pontosLivelo;
  return c.pontosEsfera;
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
          } catch {
            /* ignore */
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Falha ao carregar compra.");
      } finally {
        setSaving(false);
      }
    })();
  }, [purchaseIdFinal]);

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
    if (!cedenteSel || !program) return null;
    const amountCents = roundCents(Number(valorReais.replace(",", ".") || 0) * 100);

    if (tipo === "PONTOS") {
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

    const priceCents = roundCents(Number(clubPriceReais.replace(",", ".") || 0) * 100);
    const meta: ClubMeta = {
      program: program as LoyaltyProgram,
      tierK,
      priceCents,
      renewalDay: clampDay(renewalDay),
      startDateISO,
      bonusPoints: clubBonusPts,
      isRecurrent: clubRecurrent,
      billingCycle: clubBilling,
    };
    const base = tierK * 1000;
    const pf = base + Math.max(0, clubBonusPts);
    return {
      type: "CLUB",
      title: `Clube ${PROGRAM_LABEL[program as LoyaltyProgram]} ${tierK}k`,
      details: JSON.stringify(meta),
      programTo: program as LoyaltyProgram,
      programFrom: null,
      pointsBase: base,
      bonusMode: "TOTAL",
      bonusValue: clubBonusPts,
      pointsFinal: pf,
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
  ]);

  const expectedPreview = useMemo(() => {
    if (!cedenteSel || !program || !itemPreview) return null;
    return buildExpected(cedenteSel, program as LoyaltyProgram, itemPreview.pointsFinal);
  }, [cedenteSel, program, itemPreview]);

  const milheiroEstimado = useMemo(() => {
    if (!itemPreview || itemPreview.pointsFinal <= 0) return 0;
    return Math.round((itemPreview.amountCents * 1000) / itemPreview.pointsFinal);
  }, [itemPreview]);

  async function criarRascunho() {
    if (!cedenteSel || !program) {
      setError("Selecione cedente e programa.");
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
    if (!draft?.id || !cedenteSel || !itemPreview || !program || !expectedPreview)
      return false;
    if (itemPreview.pointsFinal <= 0) return false;
    if (tipo === "PONTOS" && itemPreview.amountCents <= 0) return false;
    if (tipo === "CLUBE" && itemPreview.amountCents < 0) return false;
    if (!silent) setSaving(true);
    setError(null);
    try {
      const items = [mapItemToApi(itemPreview)];
      const payload = {
        ciaProgram: program,
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
        ciaProgram: (raw.ciaProgram || program) as LoyaltyProgram,
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
    if (!draft?.id || !expectedPreview || !program) return;
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
    !!program;

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
            Uma compra por <b>programa</b> e <b>cedente</b>: pontos adquiridos ou assinatura de
            clube. Sem taxas extras — o milheiro vem do custo ÷ pontos.
          </p>
          {draft && (
            <div className="mt-2 text-xs text-gray-500">
              {isClosed ? (
                <span className="text-emerald-700 font-medium">Liberada</span>
              ) : (
                <>
                  Rascunho · atualizado automaticamente · programa{" "}
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
        <h2 className="font-medium">Cedente</h2>
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

      {/* Programa + tipo */}
      <div className="rounded-xl border p-4 space-y-4">
        <h2 className="font-medium">Programa e tipo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-600">Programa (destino dos pontos)</span>
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value as LoyaltyProgram | "")}
              disabled={!!draft?.id || isClosed}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {(Object.keys(PROGRAM_LABEL) as LoyaltyProgram[]).map((p) => (
                <option key={p} value={p}>
                  {PROGRAM_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm">
            <span className="text-gray-600">Tipo</span>
            <div className="mt-2 flex gap-4">
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
        </div>

        {!draft?.id && cedenteSel && program && (
          <button
            type="button"
            onClick={() => void criarRascunho()}
            disabled={saving}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Criar rascunho de compra
          </button>
        )}
      </div>

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
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="text-gray-600">Pacote (mil pontos)</span>
                  <select
                    value={tierK}
                    onChange={(e) => setTierK(clampInt(e.target.value))}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {CLUB_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {t}k / mês
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Preço (R$)</span>
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
                  <span className="text-gray-600">Início</span>
                  <input
                    type="date"
                    value={startDateISO}
                    onChange={(e) => setStartDateISO(e.target.value || isoToday())}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Bônus (pontos)</span>
                  <input
                    type="number"
                    value={clubBonusPts || ""}
                    onChange={(e) => setClubBonusPts(Math.max(0, clampInt(e.target.value)))}
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
                      <option value="MONTHLY">Mensal</option>
                      <option value="ANNUAL">Anual</option>
                    </select>
                  )}
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
            {itemPreview && program && cedenteSel ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pontos no programa</span>
                  <b className="font-mono">
                    +{itemPreview.pointsFinal.toLocaleString("pt-BR")}{" "}
                    {PROGRAM_LABEL[program as LoyaltyProgram]}
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Custo</span>
                  <b>{fmtMoneyBR(itemPreview.amountCents)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Milheiro (custo ÷ pts)</span>
                  <b>{milheiroEstimado > 0 ? fmtMoneyBR(milheiroEstimado) : "—"}</b>
                </div>
                <div className="flex justify-between text-xs text-gray-600 pt-2 border-t">
                  <span>Saldo atual {PROGRAM_LABEL[program as LoyaltyProgram]}</span>
                  <span className="font-mono">
                    {pointsOnCedente(cedenteSel, program as LoyaltyProgram).toLocaleString(
                      "pt-BR"
                    )}
                  </span>
                </div>
                {expectedPreview && (
                  <div className="flex justify-between text-xs text-emerald-800">
                    <span>Após liberar</span>
                    <span className="font-mono">
                      {program === "LATAM"
                        ? expectedPreview.expectedLatamPoints
                        : program === "SMILES"
                          ? expectedPreview.expectedSmilesPoints
                          : program === "LIVELO"
                            ? expectedPreview.expectedLiveloPoints
                            : expectedPreview.expectedEsferaPoints}
                    </span>
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
        {saving ? "Salvando…" : ""}{" "}
        Use <b>Salvar agora</b> antes de liberar. Transferências entre programas:{" "}
        <a href="/dashboard/compras/transferir" className="underline text-blue-700">
          Transferir pontos
        </a>
        .
      </p>
    </div>
  );
}
