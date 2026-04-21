"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type PointsMode = "TOTAL" | "POR_PAX";
type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";
type TripKind = "IDA" | "IDA_VOLTA";

type Owner = { id: string; name: string; login: string };

type Suggestion = {
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    scoreMedia?: number;
    biometriaHorario: {
      turnoManha: boolean;
      turnoTarde: boolean;
      turnoNoite: boolean;
    } | null;
    owner: Owner;
  };
  program: Program;
  pointsNeeded: number;
  passengersNeeded: number;
  pts: number;
  paxLimit: number;
  usedPassengersYear: number;
  availablePassengersYear: number;
  leftoverPoints: number;
  eligible: boolean;
  priorityLabel: "MAX" | "OK" | "MEIO" | "BAIXA" | "INELIGIVEL";
  alerts: string[];
};

type ClienteLite = {
  id: string;
  identificador: string;
  nome: string;
  cpfCnpj: string | null;
  telefone: string | null;
};

type CompraLiberada = {
  id: string;
  numero: string; // ID00018
  status: "CLOSED";
  ciaAerea: Program | null;
  metaMilheiroCents: number;
  custoMilheiroCents: number;
  metaMarkupCents: number;
};

type UserLite = { id: string; name: string; login: string };

type ClienteTipo = "PESSOA" | "EMPRESA";
type ClienteOrigem = "BALCAO_MILHAS" | "PARTICULAR" | "SITE" | "OUTROS";

function clampInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
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
function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function moneyToCentsBR(input: string) {
  const s = (input || "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function normStr(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function onlyDigits(v: any) {
  return String(v ?? "").replace(/\D+/g, "");
}
function biometriaTurnosShort(
  horarios:
    | {
        turnoManha: boolean;
        turnoTarde: boolean;
        turnoNoite: boolean;
      }
    | null
) {
  if (!horarios) return "—";
  const out: string[] = [];
  if (horarios.turnoManha) out.push("M");
  if (horarios.turnoTarde) out.push("T");
  if (horarios.turnoNoite) out.push("N");
  return out.length ? out.join("/") : "—";
}
function withTs(url: string) {
  const ts = Date.now();
  return url.includes("?") ? `${url}&ts=${ts}` : `${url}?ts=${ts}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withTs(url), {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as any)?.ok === false) {
    throw new Error((j as any)?.error || `Erro ${res.status}`);
  }
  return j as T;
}

type FuncItem = {
  id: string;
  name: string;
  login: string;
  cpf?: string | null;
  team?: string;
  role?: string;
  inviteCode?: string | null;
  createdAt?: string;
  _count?: { cedentes: number };
};

// ✅ credenciais do cedente (API) — compatível com 2 formatos
type CedenteCreds = {
  cpf: string;

  program?: Program;

  programEmail?: string | null;
  programPassword?: string | null;
  emailPassword?: string | null;

  email?: string | null;
  senhaPrograma?: string | null;
  senhaEmail?: string | null;
};

// ✅ resposta do painel (usada pra janela LATAM 365d ~ 13 meses)
type EmissionsPanelResp = {
  ok: true;
  program: string;
  months: Array<{ key: string; label: string }>;
  currentMonthKey: string;
  renewMonthKey: string;
  rows: Array<{
    cedenteId: string;
    total: number;
    manual: number;
    renewEndOfMonth: number;
    perMonth: Record<string, number>;
  }>;
  totals: { total: number; manual: number; renewEndOfMonth: number };
};

const PASSENGER_ALERT_MESSAGE =
  "Alerta: esta venda excede o PAX disponível e pode gerar bloqueio nas próximas 12h.";

function programToKey(p: Program): ProgramKey {
  if (p === "LATAM") return "latam";
  if (p === "SMILES") return "smiles";
  if (p === "LIVELO") return "livelo";
  return "esfera";
}

function priorityBucket(leftover: number) {
  if (leftover >= 0 && leftover <= 2000) return { bucket: 0, label: "MAX" as const };
  if (leftover >= 3000 && leftover <= 10000) return { bucket: 3, label: "BAIXA" as const };
  if (leftover > 10000) return { bucket: 1, label: "OK" as const };
  return { bucket: 2, label: "MEIO" as const };
}

// ✅ aplica janela LATAM (painel) numa sugestão
function applyLatamWindow(s: Suggestion, usedRaw: number): Suggestion {
  const paxLimit = Number(s.paxLimit || 25);
  const used = Math.max(0, Math.trunc(Number(usedRaw || 0)));
  const available = Math.max(0, paxLimit - used);

  const paxNeed = Math.max(0, Math.trunc(Number(s.passengersNeeded || 0)));
  const paxAfter = available - paxNeed;
  const paxOk = available >= paxNeed;
  const hasPts = Number(s.pts || 0) >= Number(s.pointsNeeded || 0);
      const alertPassengerOverflow = !paxOk;
      const eligible = hasPts;
      const pri = priorityBucket(Number(s.leftoverPoints || 0));

  let alerts = Array.isArray(s.alerts) ? [...s.alerts] : [];
  alerts = alerts.filter((a) => a !== "PASSAGEIROS_ESTOURADOS_COM_PONTOS");
  if (alertPassengerOverflow) {
    alerts.push("PASSAGEIROS_ESTOURADOS_COM_PONTOS");
  }

  return {
        ...s,
        usedPassengersYear: used,
        availablePassengersYear: available,
        eligible,
        priorityLabel: hasPts ? pri.label : "INELIGIVEL",
        alerts,
      };
}

export default function NovaVendaClient({ initialMe }: { initialMe: UserLite }) {
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const clientComboboxRef = useRef<HTMLDivElement | null>(null);

  // ✅ agora vem do SERVER (cookie tm.session)
  const [me, setMe] = useState<UserLite | null>(initialMe);

  // ✅ fallback opcional (só tenta se por algum motivo initialMe não veio)
  useEffect(() => {
    if (me?.id) return;

    // 1) localStorage (se existir)
    try {
      const raw = localStorage.getItem("auth_session");
      if (raw) {
        const s = JSON.parse(raw);
        const id = s?.id;
        const login = s?.login;
        const name = s?.name;
        if (id && login) {
          setMe({ id, login, name: name || login });
          return;
        }
      }
    } catch {}

    // 2) tenta getSession()
    try {
      const s = getSession();
      if ((s as any)?.id && (s as any)?.login) {
        setMe({
          id: (s as any).id,
          login: (s as any).login,
          name: (s as any).name || (s as any).login,
        });
        return;
      }
    } catch {}

    // 3) fallback: /api/auth (se existir)
    (async () => {
      try {
        const out = await api<any>("/api/auth");
        const sess =
          out?.data?.session ||
          out?.session ||
          out?.data?.user ||
          out?.user ||
          null;
        if (sess?.id && sess?.login) {
          setMe({
            id: sess.id,
            login: sess.login,
            name: sess.name || sess.login,
          });
        }
      } catch {
        // ignora
      }
    })();
  }, [me?.id]);

  // =========================
  // 1) input principal
  // =========================
  const [program, setProgram] = useState<Program>("LATAM");

  // ✅ Ida / Ida+Volta
  const [tripKind, setTripKind] = useState<TripKind>("IDA");

  // ✅ pontos por trecho (cada um pode ser TOTAL ou POR_PAX)
  const [idaMode, setIdaMode] = useState<PointsMode>("TOTAL");
  const [idaStr, setIdaStr] = useState("");
  const idaInput = useMemo(
    () => clampInt((idaStr || "").replace(/\D+/g, "")),
    [idaStr]
  );

  const [voltaMode, setVoltaMode] = useState<PointsMode>("TOTAL");
  const [voltaStr, setVoltaStr] = useState("");
  const voltaInput = useMemo(
    () => clampInt((voltaStr || "").replace(/\D+/g, "")),
    [voltaStr]
  );

  const [passengers, setPassengers] = useState(1);

  // ✅ total efetivo por trecho
  const idaTotalPoints = useMemo(() => {
    const p = Math.max(0, idaInput);
    const pax = Math.max(1, passengers);
    return idaMode === "POR_PAX" ? p * pax : p;
  }, [idaMode, idaInput, passengers]);

  const voltaTotalPoints = useMemo(() => {
    if (tripKind !== "IDA_VOLTA") return 0;
    const p = Math.max(0, voltaInput);
    const pax = Math.max(1, passengers);
    return voltaMode === "POR_PAX" ? p * pax : p;
  }, [tripKind, voltaMode, voltaInput, passengers]);

  // ✅ pontos totais (ida + volta)
  const pointsTotal = useMemo(
    () => idaTotalPoints + voltaTotalPoints,
    [idaTotalPoints, voltaTotalPoints]
  );

  // sugestões
  const [loadingSug, setLoadingSug] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sel, setSel] = useState<Suggestion | null>(null);
  const [sugError, setSugError] = useState<string>("");

  // ✅ fix LATAM: ajustar PAX pela janela 365d (painel)
  const [latamPaxLoading, setLatamPaxLoading] = useState(false);
  const [latamPaxError, setLatamPaxError] = useState("");

  // busca cedente
  const [cedenteQ, setCedenteQ] = useState("");

  // cliente
  const [clienteQ, setClienteQ] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [clientesError, setClientesError] = useState<string>("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);

  // ✅ âncora: sempre manter o selecionado no dropdown
  const [selectedCliente, setSelectedCliente] = useState<ClienteLite | null>(
    null
  );

  // ✅ modal "cadastro rápido"
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [creatingCliente, setCreatingCliente] = useState(false);
  const [createClienteError, setCreateClienteError] = useState<string>("");

  const [novoCliente, setNovoCliente] = useState<{
    tipo: ClienteTipo;
    nome: string;
    cpfCnpj: string;
    telefone: string;
    origem: ClienteOrigem;
    origemDescricao: string;
  }>({
    tipo: "PESSOA",
    nome: "",
    cpfCnpj: "",
    telefone: "",
    origem: "BALCAO_MILHAS",
    origemDescricao: "",
  });

  // ✅ compras LIBERADAS (CLOSED) do cedente selecionado
  const [compras, setCompras] = useState<CompraLiberada[]>([]);
  const [purchaseNumero, setPurchaseNumero] = useState(""); // guarda ID00018
  const [loadingCompras, setLoadingCompras] = useState(false);

  // funcionários (para cartão)
  const [users, setUsers] = useState<UserLite[]>([]);

  // vendedor da venda (por padrão: usuário logado)
  const [assignSellerOpen, setAssignSellerOpen] = useState(false);
  const [assignedSellerId, setAssignedSellerId] = useState("");

  // cartão da taxa (dropdown único)
  // SELF | VIAS | USER:<id> | MANUAL
  const [feeCardPreset, setFeeCardPreset] = useState<string>("SELF");
  const [feeCardManual, setFeeCardManual] = useState<string>("");

  // campos venda
  const [dateISO, setDateISO] = useState(isoToday());
  const [milheiroStr, setMilheiroStr] = useState("0,00");
  const [embarqueStr, setEmbarqueStr] = useState("0,00");
  const [locator, setLocator] = useState("");
  const [purchaseCode, setPurchaseCode] = useState("");
  const [firstPassengerLastName, setFirstPassengerLastName] = useState("");
  const [departureAirportIata, setDepartureAirportIata] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");

  const milheiroCents = useMemo(() => moneyToCentsBR(milheiroStr), [milheiroStr]);
  const embarqueFeeCents = useMemo(
    () => moneyToCentsBR(embarqueStr),
    [embarqueStr]
  );

  const pointsValueCents = useMemo(() => {
    const denom = pointsTotal / 1000;
    if (denom <= 0) return 0;
    return Math.round(denom * milheiroCents);
  }, [pointsTotal, milheiroCents]);

  const totalCents = useMemo(
    () => pointsValueCents + embarqueFeeCents,
    [pointsValueCents, embarqueFeeCents]
  );
  const commissionCents = useMemo(
    () => Math.round(pointsValueCents * 0.01),
    [pointsValueCents]
  );

  // encontra pela compra.numero (ID00018)
  const compraSel = useMemo(
    () => compras.find((c) => c.numero === purchaseNumero) || null,
    [compras, purchaseNumero]
  );

  const metaMilheiroCents = compraSel?.metaMilheiroCents || 0;

  const bonusCents = useMemo(() => {
    if (!metaMilheiroCents) return 0;
    const diff = milheiroCents - metaMilheiroCents;
    if (diff <= 0) return 0;
    const denom = pointsTotal / 1000;
    const diffTotal = Math.round(denom * diff);
    return Math.round(diffTotal * 0.3);
  }, [milheiroCents, metaMilheiroCents, pointsTotal]);

  // ✅ ajuste de PAX disponível (após esta venda) — usando passengersNeeded da sugestão
  const selPaxAfter = useMemo(() => {
    if (!sel) return 0;
    const after =
      (sel.availablePassengersYear || 0) - (sel.passengersNeeded || 0);
    return after;
  }, [sel]);

  function badgeClass(priorityLabel: Suggestion["priorityLabel"]) {
    return priorityLabel === "MAX"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : priorityLabel === "BAIXA"
      ? "bg-slate-100 border-slate-200 text-slate-600"
      : priorityLabel === "INELIGIVEL"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : "bg-amber-50 border-amber-200 text-amber-700";
  }

  function selectSuggestion(s: Suggestion) {
    setSel(s);
    setTimeout(() => {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  }

  // =========================
  // ✅ CREDENCIAIS (REVELAR)
  // =========================
  const [revealCreds, setRevealCreds] = useState(false);
  const [creds, setCreds] = useState<CedenteCreds | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [credsError, setCredsError] = useState("");

  const [showProgramPass, setShowProgramPass] = useState(false);
  const [showEmailPass, setShowEmailPass] = useState(false);

  const credCpf = creds?.cpf || sel?.cedente?.cpf || "";
  const credEmail = (creds?.programEmail ?? creds?.email ?? "") || "";
  const credProgramPass =
    (creds?.programPassword ?? creds?.senhaPrograma ?? "") || "";
  const credEmailPass = (creds?.emailPassword ?? creds?.senhaEmail ?? "") || "";

  async function copyText(label: string, value: string) {
    if (!value) return alert(`Nada para copiar em: ${label}`);
    try {
      await navigator.clipboard.writeText(value);
      alert(`Copiado: ${label}`);
    } catch {
      const ok = prompt(`Copie manualmente (${label}):`, value);
      void ok;
    }
  }

  async function copySilent(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      prompt("Copie:", value);
    }
  }

  async function loadCreds(cedenteId: string, p: Program, signal?: AbortSignal) {
    setLoadingCreds(true);
    setCredsError("");
    try {
      const url = `/api/cedentes/credentials?cedenteId=${encodeURIComponent(
        cedenteId
      )}&program=${encodeURIComponent(p)}`;
      const out = await api<any>(url, { signal } as any);

      const data = out?.data ?? out?.creds ?? out ?? null;
      if (!data?.cpf) throw new Error("Resposta de credenciais inválida.");

      setCreds(data as CedenteCreds);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setCreds(null);
        setCredsError(e?.message || "Erro ao carregar credenciais.");
      }
    } finally {
      if (!signal?.aborted) setLoadingCreds(false);
    }
  }

  // quando troca cedente: reseta credenciais
  useEffect(() => {
    setRevealCreds(false);
    setCreds(null);
    setCredsError("");
    setShowProgramPass(false);
    setShowEmailPass(false);
  }, [sel?.cedente?.id]);

  // quando muda o programa e está revelado: recarrega
  useEffect(() => {
    if (!revealCreds) return;
    if (!sel?.cedente?.id) return;

    const ac = new AbortController();
    loadCreds(sel.cedente.id, program, ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, revealCreds, sel?.cedente?.id]);

  function clearSelection() {
    setSel(null);
    setCompras([]);
    setPurchaseNumero("");

    setClienteId("");
    setClienteQ("");
    setClientes([]);
    setSelectedCliente(null);
    setClientesError("");
    setClientDropdownOpen(false);

    // ✅ também limpa credenciais
    setRevealCreds(false);
    setCreds(null);
    setCredsError("");
    setShowProgramPass(false);
    setShowEmailPass(false);
  }

  // carrega funcionários (preferência: /api/funcionarios)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(withTs("/api/funcionarios"), {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (json?.ok) {
          const data: FuncItem[] = json?.data || [];
          setUsers(
            (data || [])
              .filter((x) => x?.id && x?.name && x?.login)
              .map((x) => ({ id: x.id, name: x.name, login: x.login }))
          );
          return;
        }
      } catch {}

      try {
        const out = await api<{ ok: true; users: UserLite[] }>(
          "/api/users/simple"
        );
        setUsers(out.users || []);
      } catch {
        setUsers([]);
      }
    })();
  }, []);

  // label final do cartão (vai no payload)
  const feeCardLabel = useMemo(() => {
    if (feeCardPreset === "VIAS") return "Cartão Vias Aéreas";
    if (feeCardPreset === "MANUAL") return (feeCardManual || "").trim() || "";
    if (feeCardPreset.startsWith("USER:")) {
      const id = feeCardPreset.slice("USER:".length);
      const u = users.find((x) => x.id === id);
      if (!u) return "";
      return u.login ? `Cartão ${u.name} (@${u.login})` : `Cartão ${u.name}`;
    }
    if (me?.name) {
      return me.login ? `Cartão ${me.name} (@${me.login})` : `Cartão ${me.name}`;
    }
    return "Cartão do vendedor";
  }, [feeCardPreset, feeCardManual, users, me?.name, me?.login]);

  const effectiveSeller = useMemo(() => {
    if (!assignedSellerId) return me;
    return users.find((x) => x.id === assignedSellerId) || me;
  }, [assignedSellerId, users, me]);

  const effectiveSellerLabel = useMemo(() => {
    if (!effectiveSeller?.id) return "Usuário logado";
    return `${effectiveSeller.name} (@${effectiveSeller.login})`;
  }, [effectiveSeller]);

  // sugestões (debounce + abort)
  useEffect(() => {
    const ac = new AbortController();

    const t = setTimeout(async () => {
      setSugError("");

      if (pointsTotal <= 0 || passengers <= 0) {
        setSuggestions([]);
        setSel(null);
        setLatamPaxLoading(false);
        setLatamPaxError("");
        return;
      }

      setLoadingSug(true);
      try {
        const url = `/api/vendas/sugestoes?program=${encodeURIComponent(
          program
        )}&points=${encodeURIComponent(
          String(pointsTotal)
        )}&passengers=${encodeURIComponent(String(passengers))}`;

        const out = await api<{ ok: true; suggestions: Suggestion[] }>(url, {
          signal: ac.signal,
        } as any);

        let nextList = out.suggestions || [];

        // Mantém o cálculo de PAX LATAM sempre alinhado ao painel (janela 365d).
        if (program === "LATAM" && nextList.length) {
          setLatamPaxLoading(true);
          setLatamPaxError("");
          try {
            const ids = nextList.map((s) => s.cedente.id);

            const panel = await api<EmissionsPanelResp>("/api/emissions/panel", {
              method: "POST",
              body: JSON.stringify({
                programa: programToKey(program),
                months: 13,
                cedenteIds: ids,
              }),
              signal: ac.signal,
            } as any);

            const map = new Map<string, number>();
            for (const r of panel?.rows || []) {
              map.set(String(r.cedenteId), Number(r.total || 0));
            }

            nextList = nextList.map((s) => {
              const used = map.get(s.cedente.id);
              if (used == null) return s;
              return applyLatamWindow(s, used);
            });
          } catch (e: any) {
            if (e?.name !== "AbortError") {
              setLatamPaxError(
                e?.message || "Falha ao ajustar PAX (janela 365 dias)."
              );
            }
          } finally {
            if (!ac.signal.aborted) setLatamPaxLoading(false);
          }
        } else {
          setLatamPaxLoading(false);
          setLatamPaxError("");
        }

        setSuggestions(nextList);

        if (sel?.cedente?.id) {
          const selected = nextList.find((x) => x.cedente.id === sel.cedente.id);
          if (!selected) clearSelection();
          else setSel(selected);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setSuggestions([]);
          setSel(null);
          setSugError(e?.message || "Erro ao carregar sugestões");
        }
      } finally {
        if (!ac.signal.aborted) setLoadingSug(false);
      }
    }, 250);

    return () => {
      ac.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, pointsTotal, passengers]);

  // ✅ mantém selectedCliente em sync quando escolhe no select
  useEffect(() => {
    if (!clienteId) {
      setSelectedCliente(null);
      return;
    }
    const found = clientes.find((c) => c.id === clienteId);
    if (found) setSelectedCliente(found);
  }, [clienteId, clientes]);

  // ✅ cliente search (com âncora do selecionado)
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      if (!sel?.cedente?.id) return;

      const q = clienteQ.trim();
      setClientesError("");

      const isRecent = q.length < 2;

      setLoadingClientes(true);
      try {
        const url = isRecent
          ? `/api/clientes/search?recent=1`
          : `/api/clientes/search?q=${encodeURIComponent(q)}`;
        const out = await api<any>(url, { signal: ac.signal } as any);

        let list: ClienteLite[] =
          out?.clientes ||
          out?.data?.clientes ||
          out?.data?.data?.clientes ||
          [];
        if (!Array.isArray(list)) list = [];

        if (
          selectedCliente?.id &&
          !list.some((x) => x.id === selectedCliente.id)
        ) {
          list = [selectedCliente, ...list];
        }

        setClientes(list);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          const fallback = selectedCliente ? [selectedCliente] : [];
          setClientes(fallback);

          if (!isRecent)
            setClientesError(e?.message || "Erro ao buscar clientes.");
        }
      } finally {
        if (!ac.signal.aborted) setLoadingClientes(false);
      }
    }, 250);

    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [clienteQ, sel?.cedente?.id, selectedCliente?.id]);

  useEffect(() => {
    function handleOutsideClick(ev: MouseEvent) {
      if (!clientComboboxRef.current) return;
      if (!clientComboboxRef.current.contains(ev.target as Node)) {
        setClientDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function handleSelectCliente(cliente: ClienteLite) {
    setClienteId(cliente.id);
    setSelectedCliente(cliente);
    setClienteQ(cliente.nome);
    setClientes((prev) => [cliente, ...prev.filter((x) => x.id !== cliente.id)]);
    setClientDropdownOpen(false);
    setClientesError("");
  }

  async function criarClienteRapido() {
    setCreateClienteError("");

    const nome = (novoCliente.nome || "").trim();
    if (!nome) return setCreateClienteError("Informe o nome do cliente.");

    if (novoCliente.origem === "OUTROS" && !novoCliente.origemDescricao.trim()) {
      return setCreateClienteError("Em 'Outros', descreva a origem.");
    }

    setCreatingCliente(true);
    try {
      const payload = {
        tipo: novoCliente.tipo,
        nome,
        cpfCnpj: novoCliente.cpfCnpj ? onlyDigits(novoCliente.cpfCnpj) : null,
        telefone: novoCliente.telefone ? onlyDigits(novoCliente.telefone) : null,
        origem: novoCliente.origem,
        origemDescricao:
          novoCliente.origem === "OUTROS"
            ? novoCliente.origemDescricao.trim()
            : null,
      };

      const out = await api<any>("/api/clientes", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const raw = out?.data?.cliente || out?.cliente || null;
      if (!raw?.id) throw new Error("Cliente criado, mas resposta inválida.");

      const created: ClienteLite = {
        id: String(raw.id),
        identificador: String(raw.identificador || raw.code || raw.ident || "—"),
        nome: String(raw.nome || raw.name || nome),
        cpfCnpj: raw.cpfCnpj ?? null,
        telefone: raw.telefone ?? null,
      };

      setClienteId(created.id);
      setSelectedCliente(created);
      setClienteQ(created.nome);
      setClientDropdownOpen(false);

      setClientes((prev) => {
        const exists = prev.some((x) => x.id === created.id);
        const next = exists ? prev : [created, ...prev];
        return [created, ...next.filter((x) => x.id !== created.id)].slice(
          0,
          20
        );
      });

      setClienteModalOpen(false);
      setNovoCliente({
        tipo: "PESSOA",
        nome: "",
        cpfCnpj: "",
        telefone: "",
        origem: "BALCAO_MILHAS",
        origemDescricao: "",
      });
    } catch (e: any) {
      setCreateClienteError(e?.message || "Falha ao criar cliente.");
    } finally {
      setCreatingCliente(false);
    }
  }

  // ✅ quando escolhe cedente -> carrega compras LIBERADAS (CLOSED) daquele cedente
  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      if (!sel?.cedente?.id) {
        setCompras([]);
        setPurchaseNumero("");
        setLoadingCompras(false);
        return;
      }

      setLoadingCompras(true);
      try {
        const url = `/api/compras/liberadas?cedenteId=${encodeURIComponent(
          sel.cedente.id
        )}&program=${encodeURIComponent(program)}`;

        const out = await api<{ ok: true; compras: CompraLiberada[] }>(url, {
          signal: ac.signal,
        } as any);

        const list = Array.isArray(out.compras) ? out.compras : [];
        setCompras(list);

        setPurchaseNumero((prev) => {
          if (prev && list.some((c) => c.numero === prev)) return prev;
          if (list.length === 1) return list[0].numero;
          return "";
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setCompras([]);
          setPurchaseNumero("");
        }
      } finally {
        if (!ac.signal.aborted) setLoadingCompras(false);
      }
    })();

    return () => ac.abort();
  }, [sel?.cedente?.id, program]);

  // ✅ helper: formata input de pontos e manda pro setter certo
  function onChangePoints(setter: (v: string) => void, v: string) {
    const digits = (v || "").replace(/\D+/g, "");
    if (!digits) return setter("");
    const n = clampInt(digits);
    setter(n.toLocaleString("pt-BR"));
  }

  const canSave = useMemo(() => {
    if (!sel?.eligible) return false;
    if (!clienteId) return false;
    if (!purchaseNumero) return false;
    if (!compraSel) return false;
    if (pointsTotal <= 0 || passengers <= 0) return false;
    if (milheiroCents <= 0) return false;
    if (!locator?.trim()) return false; // ✅ obrigatório
    if (
      (program === "SMILES" || program === "LATAM") &&
      !firstPassengerLastName.trim()
    )
      return false;
    if ((program === "SMILES" || program === "LATAM") && !departureDate) return false;
    if (
      program === "LATAM" &&
      !/^LA[A-Z0-9]*$/i.test((purchaseCode || "").trim().toUpperCase())
    )
      return false;
    if (
      program === "SMILES" &&
      !/^[A-Z]{3}$/.test((departureAirportIata || "").trim().toUpperCase())
    )
      return false;
    if (feeCardPreset === "MANUAL" && !feeCardLabel) return false;
    return true;
  }, [
    sel?.eligible,
    clienteId,
    purchaseNumero,
    compraSel,
    pointsTotal,
    passengers,
    milheiroCents,
    locator,
    purchaseCode,
    program,
    firstPassengerLastName,
    departureAirportIata,
    departureDate,
    feeCardPreset,
    feeCardLabel,
  ]);

  const [postSaveOpen, setPostSaveOpen] = useState(false);
  const [postSaveMsg, setPostSaveMsg] = useState("");

  // ✅ confirmação + overlay saving
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmZeroFee, setConfirmZeroFee] = useState(false);
  const [confirmPassengerRisk, setConfirmPassengerRisk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const feeIsZero = embarqueFeeCents <= 0;
  const passengerRisk = Boolean(sel?.alerts?.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS"));

  function openConfirmModal() {
    setConfirmZeroFee(false);
    setConfirmPassengerRisk(false);
    setConfirmOpen(true);
  }

  function closeConfirmModal() {
    setConfirmZeroFee(false);
    setConfirmPassengerRisk(false);
    setConfirmOpen(false);
  }

  function toBRDate(iso: string) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  }

  function cap1(s?: string | null) {
    const v = (s || "").trim();
    if (!v) return "";
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  function buildTelegramMessage(args: {
    saleId?: string | null;
    cliente: ClienteLite | null;
    program: Program;

    tripKind: TripKind;
    idaMode: PointsMode;
    idaInput: number;
    idaTotalPoints: number;
    voltaMode: PointsMode;
    voltaInput: number;
    voltaTotalPoints: number;

    passengers: number;
    pointsTotal: number;

    milheiroCents: number;
    pointsValueCents: number;
    embarqueFeeCents: number;
    totalCents: number;
    locator: string;
    compraNumero: string;
    cedenteNome: string;
    responsavelNome: string;
    feeCardLabel: string;
    dateISO: string;
    vendedorNome?: string | null;
  }) {
    const lines: string[] = [];

    lines.push("Parabéns, sua passagem foi emitida com sucesso!");
    lines.push("");

    lines.push(`📅 Data: ${toBRDate(args.dateISO)}`);

    if (args.vendedorNome) lines.push(`👤 Vendedor: ${cap1(args.vendedorNome)}`);
    if (args.cliente) lines.push(`🧾 Cliente: ${args.cliente.nome}`);

    lines.push(`✈️ Programa: ${args.program}`);
    lines.push(`🎯 Pontos: ${fmtInt(args.pointsTotal)}`);
    lines.push(`👥 PAX: ${fmtInt(args.passengers)}`);
    lines.push(`💸 Milheiro: ${fmtMoneyBR(args.milheiroCents)}`);
    lines.push(`🧮 Valor pontos: ${fmtMoneyBR(args.pointsValueCents)}`);
    lines.push(`🛄 Taxa embarque: ${fmtMoneyBR(args.embarqueFeeCents)}`);
    lines.push(`💰 Total: ${fmtMoneyBR(args.totalCents)}`);
    lines.push(`Cartão usado: ${args.feeCardLabel || "—"}`);

    if (args.locator?.trim())
      lines.push(`🔎 Localizador: ${args.locator.trim()}`);

    lines.push("");
    lines.push("Dados para pagamento");
    lines.push("Pix: 63817773000185 (CNPJ)");
    lines.push("Nome: Vias Aereas");
    lines.push("Banco: Inter");
    lines.push(`Total a pagar: ${fmtMoneyBR(args.totalCents)}`);
    lines.push("");
    lines.push("⚠️ Confira datas, horários e dados do passageiro.");
    lines.push(
      "Informe divergências em até 24h após a emissão. Após esse prazo, ajustes podem ter custo (R$ 30)."
    );
    lines.push("");
    lines.push(
      "📌 Emissões feitas com menos de 24h ou até 7 dias do voo podem gerar taxas extras (Res. ANAC 400)."
    );
    lines.push("");
    lines.push("Em caso de dúvida, estamos à disposição. ✈️");

    return lines.join("\n");
  }

  async function doSave() {
    if (isSaving) return; // ✅ trava duplo clique

    if (!sel?.eligible) return alert("Selecione um cedente elegível.");
    if (!clienteId) return alert("Selecione um cliente.");
    if (!purchaseNumero)
      return alert("Selecione a compra LIBERADA (ID00018).");
    if (!compraSel) return alert("Compra selecionada inválida.");
    if (pointsTotal <= 0 || passengers <= 0)
      return alert("Pontos/Passageiros inválidos.");
    if (milheiroCents <= 0) return alert("Milheiro inválido.");
    if (!locator?.trim())
      return alert("Informe o localizador (obrigatório).");
    if (
      (program === "SMILES" || program === "LATAM") &&
      !firstPassengerLastName.trim()
    )
      return alert(
        "Informe o sobrenome do primeiro passageiro (obrigatório para Smiles e Latam)."
      );
    if ((program === "SMILES" || program === "LATAM") && !departureDate)
      return alert("Informe a data de ida (obrigatória para Smiles e Latam).");
    if (
      program === "LATAM" &&
      !/^LA[A-Z0-9]*$/i.test((purchaseCode || "").trim().toUpperCase())
    )
      return alert("Informe o código de compra LATAM iniciando com LA.");
    if (
      program === "SMILES" &&
      !/^[A-Z]{3}$/.test((departureAirportIata || "").trim().toUpperCase())
    )
      return alert(
        "Informe o aeroporto de ida com 3 letras (IATA), ex.: GRU."
      );
    if (feeCardPreset === "MANUAL" && !feeCardLabel)
      return alert("Informe o nome do cartão (manual).");

    const payload = {
      program,
      points: pointsTotal,
      passengers,
      cedenteId: sel.cedente.id,
      clienteId,
      purchaseNumero,
      date: dateISO,
      milheiroCents,
      embarqueFeeCents,
      feeCardLabel: feeCardLabel || null,
      locator: locator?.trim() || null,
      sellerId: effectiveSeller?.id || null,
      purchaseCode: (purchaseCode || "").trim().toUpperCase() || null,
      firstPassengerLastName: firstPassengerLastName.trim() || null,
      departureAirportIata: (departureAirportIata || "").trim().toUpperCase() || null,
      departureDate: departureDate || null,
      returnDate: returnDate || null,
    };

    setIsSaving(true);
    try {
      const out = await api<any>("/api/vendas", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const sale =
        out?.data?.sale ||
        out?.sale ||
        out?.data?.venda ||
        out?.venda ||
        out?.data ||
        null;

      const saleId =
        sale?.id ||
        sale?.saleId ||
        out?.data?.saleId ||
        out?.saleId ||
        out?.data?.id ||
        out?.id ||
        null;


      const msg = buildTelegramMessage({
        saleId: saleId ? String(saleId) : null,
        cliente: selectedCliente,
        program,

        tripKind,
        idaMode,
        idaInput,
        idaTotalPoints,
        voltaMode,
        voltaInput,
        voltaTotalPoints,

        passengers,
        pointsTotal,

        milheiroCents,
        pointsValueCents,
        embarqueFeeCents,
        totalCents,
        locator,
        compraNumero: purchaseNumero,
        cedenteNome: sel.cedente.nomeCompleto,
        responsavelNome: sel.cedente.owner.name,
        feeCardLabel: feeCardLabel || "—",
        dateISO,
        vendedorNome: effectiveSeller?.name || me?.name || null,
      });

      setPostSaveMsg(msg);
      setPostSaveOpen(true);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSaving(false);
    }
  }

  const filteredSuggestions = useMemo(() => {
    const q = normStr(cedenteQ);
    if (!q) return suggestions;

    return suggestions.filter((s) => {
      const hay = [
        s.cedente.nomeCompleto,
        s.cedente.identificador,
        s.cedente.cpf,
        s.cedente.owner?.name,
        s.cedente.owner?.login,
      ]
        .map(normStr)
        .join(" | ");
      return hay.includes(q);
    });
  }, [suggestions, cedenteQ]);

  const visibleSuggestions = useMemo(
    () => filteredSuggestions.slice(0, 10),
    [filteredSuggestions]
  );

  const countLabel = useMemo(() => {
    if (loadingSug) return "Calculando...";
    if (sel) return "Selecionado";
    const q = normStr(cedenteQ);
    if (!suggestions.length) return "0 resultados";
    if (q)
      return `${Math.min(10, filteredSuggestions.length)} de ${
        filteredSuggestions.length
      } (busca)`;
    return `${Math.min(10, suggestions.length)} de ${suggestions.length}`;
  }, [loadingSug, sel, cedenteQ, suggestions.length, filteredSuggestions.length]);

  const selfLabel = useMemo(
    () => (me?.name ? `Meu cartão (${me.name})` : "Meu cartão"),
    [me?.name]
  );

  const selfSellerLabel = useMemo(() => {
    if (!me?.id) return "Usuário logado";
    return `${me.name} (@${me.login})`;
  }, [me]);

  // ======================================================
  // ✅ WhatsApp do cedente (somente LATAM)
  // ======================================================
  const [waMap, setWaMap] = useState<
    Record<
      string,
      { telefone: string | null; whatsappE164: string | null; whatsappUrl: string | null }
    >
  >({});
  const [waLoading, setWaLoading] = useState(false);
  const [waError, setWaError] = useState("");

  const selWhatsApp = useMemo(() => {
    const id = sel?.cedente?.id;
    return id ? waMap[id] || null : null;
  }, [sel?.cedente?.id, waMap]);

  async function loadCedentesWhatsapp(signal?: AbortSignal) {
    setWaLoading(true);
    setWaError("");
    try {
      const out = await api<any>("/api/cedentes/whatsapp", { signal } as any);
      const rows = Array.isArray(out?.rows)
        ? out.rows
        : Array.isArray(out?.data?.rows)
        ? out.data.rows
        : Array.isArray(out?.data)
        ? out.data
        : [];

      const next: Record<
        string,
        { telefone: string | null; whatsappE164: string | null; whatsappUrl: string | null }
      > = {};

      for (const r of rows) {
        if (!r?.id) continue;
        next[String(r.id)] = {
          telefone: r.telefone ?? null,
          whatsappE164: r.whatsappE164 ?? null,
          whatsappUrl: r.whatsappUrl ?? null,
        };
      }

      setWaMap(next);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setWaError(e?.message || "Erro ao carregar WhatsApp dos cedentes.");
      }
    } finally {
      if (!signal?.aborted) setWaLoading(false);
    }
  }

  // ✅ carrega WhatsApp uma vez (quando selecionar LATAM)
  useEffect(() => {
    if (program !== "LATAM") return;
    if (!sel?.cedente?.id) return;
    if (Object.keys(waMap).length > 0) return;

    const ac = new AbortController();
    loadCedentesWhatsapp(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, sel?.cedente?.id]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nova venda</h1>
          <p className="text-sm text-slate-500">
            Informe pontos + CIA + passageiros. O sistema sugere o melhor cedente.
          </p>
          {sugError ? (
            <div className="mt-2 text-xs text-rose-600">{sugError}</div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Link
            href="/dashboard/vendas"
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Voltar
          </Link>
        </div>
      </div>

      {/* 1) Input */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="font-medium">1) Dados da venda</div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-1">
            <div className="text-xs text-slate-600">CIA / Programa</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={program}
              onChange={(e) => setProgram(e.target.value as Program)}
            >
              <option value="LATAM">LATAM</option>
              <option value="SMILES">SMILES</option>
              <option value="LIVELO">LIVELO</option>
              <option value="ESFERA">ESFERA</option>
            </select>
          </label>

          {/* ✅ Trecho + Pontos (Ida/Volta) */}
          <div className="md:col-span-2 space-y-2">
            <div className="text-xs text-slate-600">Trecho</div>

            <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="tripKind"
                  checked={tripKind === "IDA"}
                  onChange={() => setTripKind("IDA")}
                />
                Só ida
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="tripKind"
                  checked={tripKind === "IDA_VOLTA"}
                  onChange={() => setTripKind("IDA_VOLTA")}
                />
                Ida + Volta
              </label>

              <span className="text-slate-500">
                • Total calculado:{" "}
                <b className="tabular-nums">{fmtInt(pointsTotal)}</b>
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {/* IDA */}
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-slate-600 mb-2">Pontos (Ida)</div>

                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                  value={idaStr}
                  onChange={(e) => onChangePoints(setIdaStr, e.target.value)}
                  placeholder={
                    idaMode === "POR_PAX"
                      ? "Ex: 100.000 (por pax)"
                      : "Ex: 200.000 (total)"
                  }
                />

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="idaMode"
                      checked={idaMode === "TOTAL"}
                      onChange={() => setIdaMode("TOTAL")}
                    />
                    Total
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="idaMode"
                      checked={idaMode === "POR_PAX"}
                      onChange={() => setIdaMode("POR_PAX")}
                    />
                    Por passageiro
                  </label>

                  {idaMode === "POR_PAX" && idaInput > 0 ? (
                    <span className="text-slate-500">
                      • Ida total:{" "}
                      <b className="tabular-nums">{fmtInt(idaTotalPoints)}</b>
                    </span>
                  ) : null}
                </div>
              </div>

              {/* VOLTA */}
              <div
                className={cn(
                  "rounded-xl border p-3 bg-white",
                  tripKind !== "IDA_VOLTA" ? "opacity-50" : ""
                )}
              >
                <div className="text-xs text-slate-600 mb-2">Pontos (Volta)</div>

                <input
                  disabled={tripKind !== "IDA_VOLTA"}
                  className="w-full rounded-xl border px-3 py-2 text-sm font-mono disabled:bg-slate-50"
                  value={voltaStr}
                  onChange={(e) => onChangePoints(setVoltaStr, e.target.value)}
                  placeholder={
                    voltaMode === "POR_PAX"
                      ? "Ex: 100.000 (por pax)"
                      : "Ex: 200.000 (total)"
                  }
                />

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <label className="inline-flex items-center gap-2">
                    <input
                      disabled={tripKind !== "IDA_VOLTA"}
                      type="radio"
                      name="voltaMode"
                      checked={voltaMode === "TOTAL"}
                      onChange={() => setVoltaMode("TOTAL")}
                    />
                    Total
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      disabled={tripKind !== "IDA_VOLTA"}
                      type="radio"
                      name="voltaMode"
                      checked={voltaMode === "POR_PAX"}
                      onChange={() => setVoltaMode("POR_PAX")}
                    />
                    Por passageiro
                  </label>

                  {tripKind === "IDA_VOLTA" &&
                  voltaMode === "POR_PAX" &&
                  voltaInput > 0 ? (
                    <span className="text-slate-500">
                      • Volta total:{" "}
                      <b className="tabular-nums">{fmtInt(voltaTotalPoints)}</b>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Passageiros</div>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
              value={passengers}
              onChange={(e) =>
                setPassengers(Math.max(1, clampInt(e.target.value)))
              }
            />
          </label>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Sugestões consideram: <b>pontos</b>, <b>limite de passageiros</b>{" "}
          (LATAM: 365 dias / Smiles: anual) e <b>bloqueio</b> (BlockedAccount
          OPEN).
        </div>
      </div>

      {/* 2) Sugestões */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <div className="font-medium">2) Cedentes sugeridos</div>
            <div className="text-xs text-slate-500">
              Prioridade: sobrar &lt; 2k (MAX) • sobrar 3-10k (BAIXA) • acima de
              10k, sobrar menos primeiro.
            </div>
            {program === "LATAM" ? (
              <div className="mt-1 text-[11px] text-slate-500">
                {latamPaxLoading ? (
                  "Ajustando PAX (janela 365 dias)…"
                ) : latamPaxError ? (
                  <span className="text-rose-600">{latamPaxError}</span>
                ) : (
                  "PAX: janela 365 dias (painel)."
                )}
              </div>
            ) : null}
          </div>
          <div className="text-xs text-slate-500">{countLabel}</div>
        </div>

        {sel ? (
          <div className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="text-xs text-slate-500">Cedente selecionado</div>
                <div className="text-base font-semibold">
                  {sel.cedente.nomeCompleto}
                </div>
                <div className="text-xs text-slate-500">
                  {sel.cedente.identificador} • Resp.:{" "}
                  <b>{sel.cedente.owner.name}</b> (@{sel.cedente.owner.login})
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border bg-white px-2 py-1">
                    PTS: <b className="tabular-nums">{fmtInt(sel.pts)}</b>
                  </span>

                  {/* ✅ PAX disponível AJUSTADO (APÓS esta venda) */}
                  <span className="rounded-full border bg-white px-2 py-1">
                    PAX após:{" "}
                    <b
                      className={cn(
                        "tabular-nums",
                        selPaxAfter < 0 ||
                          sel.alerts.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS")
                          ? "text-rose-600"
                          : ""
                      )}
                    >
                      {fmtInt(Math.max(0, selPaxAfter))}
                    </b>{" "}
                    <span className="text-slate-500">
                      (agora {fmtInt(sel.availablePassengersYear)} • usados{" "}
                      {fmtInt(sel.usedPassengersYear)}/{fmtInt(sel.paxLimit)}
                      {program === "LATAM" ? " • 365d" : ""} • consome{" "}
                      {fmtInt(sel.passengersNeeded)})
                    </span>
                  </span>

                  <span className="rounded-full border bg-white px-2 py-1">
                    Sobra:{" "}
                    <b className="tabular-nums">{fmtInt(sel.leftoverPoints)}</b>
                  </span>

                  <span
                    className={cn(
                      "rounded-full border px-2 py-1",
                      scoreBadgeClass(sel.cedente.scoreMedia)
                    )}
                  >
                    Score: <b>{fmtScore(sel.cedente.scoreMedia)}</b>/10
                  </span>

                  {program === "LATAM" ? (
                    <span className="rounded-full border bg-white px-2 py-1">
                      Biometria:{" "}
                      <b>{biometriaTurnosShort(sel.cedente.biometriaHorario)}</b>
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      "rounded-full border px-2 py-1",
                      badgeClass(sel.priorityLabel)
                    )}
                  >
                    {sel.priorityLabel}
                  </span>
                </div>

                {sel.alerts.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS") ? (
                  <div className="mt-2 text-[11px] text-rose-600">
                    {PASSENGER_ALERT_MESSAGE}
                  </div>
                ) : null}

                {/* ✅ Credenciais (revelar) */}
                <div className="mt-3 rounded-xl border bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-700">
                      Credenciais ({program})
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!sel?.cedente?.id) return;

                          if (!revealCreds) {
                            setRevealCreds(true);
                            setShowProgramPass(false);
                            setShowEmailPass(false);

                            const ac = new AbortController();
                            loadCreds(sel.cedente.id, program, ac.signal);
                          } else {
                            setRevealCreds(false);
                            setShowProgramPass(false);
                            setShowEmailPass(false);
                          }
                        }}
                        className="rounded-lg border bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                      >
                        {revealCreds ? "Ocultar" : "Revelar"}
                      </button>

                      {loadingCreds ? (
                        <div className="text-[11px] text-slate-500">
                          Carregando…
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {credsError ? (
                    <div className="mt-1 text-[11px] text-rose-600">
                      {credsError}
                    </div>
                  ) : null}

                  {revealCreds ? (
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <CopyField
                        label="CPF"
                        value={credCpf}
                        onCopy={(v) => copyText("CPF", v)}
                      />
                      <CopyField
                        label="Email"
                        value={credEmail}
                        onCopy={(v) => copyText("Email", v)}
                      />

                      <CopyField
                        label="Senha do programa"
                        value={credProgramPass}
                        masked={!showProgramPass}
                        onToggleMask={() => setShowProgramPass((s) => !s)}
                        onCopy={(v) => copyText("Senha do programa", v)}
                      />

                      <CopyField
                        label="Senha do email"
                        value={credEmailPass}
                        masked={!showEmailPass}
                        onToggleMask={() => setShowEmailPass((s) => !s)}
                        onCopy={(v) => copyText("Senha do email", v)}
                      />
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">
                      Clique em <b>Revelar</b> para mostrar e copiar.
                    </div>
                  )}
                </div>

                {/* ✅ WhatsApp do cedente (apenas LATAM) */}
                {program === "LATAM" ? (
                  <div className="mt-3 rounded-xl border bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-700">
                        WhatsApp do cedente
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!selWhatsApp?.whatsappUrl}
                          onClick={() => {
                            const url = selWhatsApp?.whatsappUrl;
                            if (!url) return;
                            window.open(url, "_blank", "noopener,noreferrer");
                          }}
                          className={cn(
                            "rounded-lg border bg-white px-2 py-1 text-[11px]",
                            selWhatsApp?.whatsappUrl
                              ? "hover:bg-slate-50"
                              : "opacity-40 cursor-not-allowed"
                          )}
                        >
                          Abrir WhatsApp
                        </button>

                        <button
                          type="button"
                          disabled={!selWhatsApp?.whatsappUrl}
                          onClick={async () => {
                            const url = selWhatsApp?.whatsappUrl;
                            if (!url) return;
                            await copySilent(url);
                          }}
                          className={cn(
                            "rounded-lg border bg-white px-2 py-1 text-[11px]",
                            selWhatsApp?.whatsappUrl
                              ? "hover:bg-slate-50"
                              : "opacity-40 cursor-not-allowed"
                          )}
                        >
                          Copiar link
                        </button>
                      </div>
                    </div>

                    {waLoading ? (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Carregando WhatsApp...
                      </div>
                    ) : waError ? (
                      <div className="mt-2 text-[11px] text-rose-600">
                        {waError}
                      </div>
                    ) : selWhatsApp?.whatsappUrl ? (
                      <div className="mt-2 text-[11px] text-slate-600 break-all">
                        {selWhatsApp.whatsappUrl}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Sem telefone/WhatsApp cadastrado para este cedente.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    detailsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Ir para dados
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Trocar cedente
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 border-b">
              <div className="grid gap-3 md:grid-cols-3 md:items-end">
                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">
                    Pesquisar cedente (nome, ID, CPF, responsável)
                  </div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={cedenteQ}
                    onChange={(e) => setCedenteQ(e.target.value)}
                    placeholder="Ex: Rayssa / RAY-212 / Lucas / 123..."
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setCedenteQ("")}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Limpar busca
                </button>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                Mostrando no máximo <b>10</b>. Para achar alguém específico, use
                a busca acima.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-slate-600">
                    <th className="text-left font-semibold px-4 py-3 w-[360px]">
                      CEDENTE
                    </th>
                    <th className="text-left font-semibold px-4 py-3 w-[220px]">
                      RESPONSÁVEL
                    </th>
                    <th className="text-right font-semibold px-4 py-3 w-[110px]">
                      SCORE
                    </th>
                    <th className="text-right font-semibold px-4 py-3 w-[140px]">
                      PTS
                    </th>
                    <th className="text-left font-semibold px-4 py-3 w-[110px]">
                      BIOMETRIA
                    </th>
                    <th className="text-right font-semibold px-4 py-3 w-[260px]">
                      PAX DISP. (após)
                    </th>
                    <th className="text-right font-semibold px-4 py-3 w-[140px]">
                      SOBRA
                    </th>
                    <th className="text-left font-semibold px-4 py-3 w-[140px]">
                      PRIOR.
                    </th>
                    <th className="text-right font-semibold px-4 py-3 w-[120px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {!loadingSug && suggestions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-slate-500">
                        Informe pontos e passageiros para ver sugestões.
                      </td>
                    </tr>
                  ) : null}

                  {!loadingSug &&
                  suggestions.length > 0 &&
                  visibleSuggestions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-slate-500">
                        Nenhum cedente encontrado para essa busca.
                      </td>
                    </tr>
                  ) : null}

                  {visibleSuggestions.map((s) => {
                    const badge = badgeClass(s.priorityLabel);
                    const paxAfter =
                      (s.availablePassengersYear || 0) -
                      (s.passengersNeeded || 0);
                    const paxAfterClamped = Math.max(0, paxAfter);

                    return (
                      <tr key={s.cedente.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.cedente.nomeCompleto}</div>
                          <div className="text-xs text-slate-500">{s.cedente.identificador}</div>
                          {s.alerts.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS") ? (
                            <div className="mt-1 text-[11px] text-rose-600">
                              {PASSENGER_ALERT_MESSAGE}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.cedente.owner.name}</div>
                          <div className="text-xs text-slate-500">@{s.cedente.owner.login}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-1 text-xs",
                              scoreBadgeClass(s.cedente.scoreMedia)
                            )}
                          >
                            {fmtScore(s.cedente.scoreMedia)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtInt(s.pts)}</td>
                        <td className="px-4 py-3 text-left">
                          {program === "LATAM" ? (
                            <span className="inline-flex rounded-full border px-2 py-1 text-xs">
                              {biometriaTurnosShort(s.cedente.biometriaHorario)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span
                            className={cn(
                              paxAfter < 0 ||
                                s.alerts.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS")
                                ? "text-rose-600 font-semibold"
                                : ""
                            )}
                          >
                            {fmtInt(paxAfterClamped)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {" "}
                            (agora {fmtInt(s.availablePassengersYear)} • usados {fmtInt(s.usedPassengersYear)}/{fmtInt(s.paxLimit)}
                            {program === "LATAM" ? " • 365d" : ""} • consome {fmtInt(s.passengersNeeded)})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtInt(s.leftoverPoints)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs", badge)}>
                            {s.priorityLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            disabled={!s.eligible}
                            onClick={() => selectSuggestion(s)}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm",
                              s.eligible ? "hover:bg-slate-50" : "opacity-40 cursor-not-allowed"
                            )}
                          >
                            Usar
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {loadingSug ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 3) Detalhes */}
      {sel ? (
        <div ref={detailsRef} className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border bg-white p-5">
              <div className="font-medium">3) Cliente + Compra LIBERADA + Dados</div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Data</div>
                  <input
                    type="date"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={dateISO}
                    onChange={(e) => setDateISO(e.target.value)}
                  />
                </label>

                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Vendedor</div>
                  <div className="rounded-xl border bg-slate-50 px-3 py-2">
                    <div className="flex min-h-[32px] items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {effectiveSellerLabel}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-1 text-[11px]",
                            assignedSellerId
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-white text-slate-600"
                          )}
                        >
                          {assignedSellerId ? "Atribuída" : "Logado"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAssignSellerOpen((v) => !v)}
                          className="rounded-lg border bg-white px-2.5 py-1 text-xs hover:bg-slate-100"
                        >
                          Trocar
                        </button>
                      </div>
                    </div>
                  </div>
                  {assignSellerOpen ? (
                    <div className="rounded-xl border border-dashed p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="min-w-[260px] flex-1 rounded-xl border px-3 py-2 text-sm bg-white"
                          value={assignedSellerId || "SELF"}
                          onChange={(e) =>
                            setAssignedSellerId(
                              e.target.value === "SELF" ? "" : e.target.value
                            )
                          }
                        >
                          <option value="SELF">{selfSellerLabel}</option>
                          {users.length ? <option disabled>────────────</option> : null}
                          {users
                            .filter((u) => u.id !== me?.id)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} (@{u.login})
                              </option>
                            ))}
                        </select>
                        {assignedSellerId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAssignedSellerId("");
                              setAssignSellerOpen(false);
                            }}
                            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            Voltar ao logado
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div ref={clientComboboxRef} className="md:col-span-2 space-y-1">
                  <div className="text-xs text-slate-600">Cliente</div>
                  <div className="relative">
                    <div className="flex gap-2">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={clienteQ}
                        onFocus={() => setClientDropdownOpen(true)}
                        onChange={(e) => {
                          const next = e.target.value;
                          setClienteQ(next);
                          setClientDropdownOpen(true);
                          if (selectedCliente && normStr(next) !== normStr(selectedCliente.nome)) {
                            setClienteId("");
                            setSelectedCliente(null);
                          }
                        }}
                        placeholder="Buscar cliente por nome / CPF/CNPJ / telefone..."
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setCreateClienteError("");
                          setNovoCliente((p) => ({ ...p, nome: clienteQ.trim() }));
                          setClienteModalOpen(true);
                        }}
                        className="rounded-xl border px-3 py-2 text-base leading-none hover:bg-slate-50"
                        title="Cadastrar cliente"
                        aria-label="Cadastrar cliente"
                      >
                        +
                      </button>
                    </div>

                    {clientDropdownOpen ? (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border bg-white shadow-lg">
                        <div className="max-h-72 overflow-auto py-1">
                          {loadingClientes ? (
                            <div className="px-3 py-2 text-sm text-slate-500">Buscando...</div>
                          ) : null}

                          {clientes.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleSelectCliente(c)}
                              className={cn(
                                "flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50",
                                selectedCliente?.id === c.id ? "bg-slate-50" : ""
                              )}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900">
                                  {c.nome}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {c.identificador || "—"}
                                  {c.cpfCnpj ? ` • ${c.cpfCnpj}` : ""}
                                  {c.telefone ? ` • ${c.telefone}` : ""}
                                </div>
                              </div>
                              {selectedCliente?.id === c.id ? (
                                <span className="text-xs font-medium text-emerald-700">
                                  Selecionado
                                </span>
                              ) : null}
                            </button>
                          ))}

                          {!loadingClientes &&
                          clienteQ.trim().length >= 2 &&
                          clientes.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-600">
                              Nenhum cliente encontrado.{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  setCreateClienteError("");
                                  setNovoCliente((p) => ({
                                    ...p,
                                    nome: clienteQ.trim(),
                                  }));
                                  setClienteModalOpen(true);
                                }}
                                className="underline"
                              >
                                Cadastrar agora
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {clientesError ? (
                    <div className="text-[11px] text-rose-600">{clientesError}</div>
                  ) : null}

                  {selectedCliente?.id ? (
                    <div className="text-[11px] text-slate-500">
                      Selecionado: <b>{selectedCliente.nome}</b> ({selectedCliente.identificador || "—"})
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Compra LIBERADA</div>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                    value={purchaseNumero}
                    onChange={(e) => setPurchaseNumero(e.target.value)}
                    disabled={loadingCompras}
                  >
                    <option value="">
                      {loadingCompras
                        ? "Carregando compras liberadas..."
                        : compras.length
                        ? "Selecione..."
                        : "Nenhuma compra liberada"}
                    </option>
                    {compras.map((c) => (
                      <option key={c.id} value={c.numero}>
                        {c.numero} • meta{" "}
                        {((c.metaMilheiroCents || 0) / 100)
                          .toFixed(2)
                          .replace(".", ",")}
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-slate-500">
                    Precisa estar LIBERADA e ser do mesmo cedente.
                  </div>
                </div>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Cartão da taxa</div>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                    value={feeCardPreset}
                    onChange={(e) => setFeeCardPreset(e.target.value)}
                  >
                    <option value="SELF">{selfLabel}</option>
                    <option value="VIAS">Vias Aéreas</option>
                    {users.length ? <option disabled>────────────</option> : null}
                    {users.map((u) => (
                      <option key={u.id} value={`USER:${u.id}`}>
                        {u.name} (@{u.login})
                      </option>
                    ))}
                    <option value="MANUAL">Manual</option>
                  </select>

                  {feeCardPreset === "MANUAL" ? (
                    <input
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      value={feeCardManual}
                      onChange={(e) => setFeeCardManual(e.target.value)}
                      placeholder="Ex: Cartão Inter PJ"
                    />
                  ) : (
                    <div className="text-[11px] text-slate-500">
                      {feeCardLabel || "—"}
                    </div>
                  )}
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Milheiro (R$)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                    value={milheiroStr}
                    onChange={(e) => setMilheiroStr(e.target.value)}
                    placeholder="Ex: 25,50"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Taxa de embarque (R$)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                    value={embarqueStr}
                    onChange={(e) => setEmbarqueStr(e.target.value)}
                    placeholder="Ex: 78,34"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">
                    Localizador <span className="text-rose-600">*</span>
                  </div>
                  <input
                    required
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                    value={locator}
                    onChange={(e) => setLocator(e.target.value)}
                    placeholder="Obrigatório"
                  />
                </label>

                {program === "LATAM" || program === "SMILES" ? (
                  <>
                    <label className="space-y-1">
                      <div className="text-xs text-slate-600">
                        Data de ida <span className="text-rose-600">*</span>
                      </div>
                      <input
                        type="date"
                        required
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={departureDate}
                        onChange={(e) => setDepartureDate(e.target.value)}
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="text-xs text-slate-600">Data de volta</div>
                      <input
                        type="date"
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                      />
                    </label>

                    {program === "LATAM" ? (
                      <label className="space-y-1">
                        <div className="text-xs text-slate-600">
                          Código de compra{" "}
                          <span className="text-rose-600">*</span>
                        </div>
                        <input
                          required
                          className="w-full rounded-xl border px-3 py-2 text-sm font-mono uppercase"
                          value={purchaseCode}
                          onChange={(e) =>
                            setPurchaseCode(
                              e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
                            )
                          }
                          placeholder="Ex: LA123456"
                        />
                      </label>
                    ) : null}

                    <label className="space-y-1">
                      <div className="text-xs text-slate-600">
                        Sobrenome do 1º passageiro{" "}
                        <span className="text-rose-600">*</span>
                      </div>
                      <input
                        required
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={firstPassengerLastName}
                        onChange={(e) => setFirstPassengerLastName(e.target.value)}
                        placeholder="Ex: SILVA"
                      />
                    </label>

                    {program === "SMILES" ? (
                      <label className="space-y-1">
                        <div className="text-xs text-slate-600">
                          Aeroporto de ida (IATA){" "}
                          <span className="text-rose-600">*</span>
                        </div>
                        <input
                          required
                          maxLength={3}
                          className="w-full rounded-xl border px-3 py-2 text-sm font-mono uppercase"
                          value={departureAirportIata}
                          onChange={(e) =>
                            setDepartureAirportIata(
                              e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase()
                            )
                          }
                          placeholder="Ex: GRU"
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Resumo */}
          <div className="rounded-2xl border bg-white p-5 h-fit lg:sticky lg:top-4 space-y-2">
            <div className="font-medium">Resumo</div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Trecho</span>
                <b>{tripKind === "IDA_VOLTA" ? "Ida + Volta" : "Só ida"}</b>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-600">Pontos (ida)</span>
                <b>{fmtInt(idaTotalPoints)}</b>
              </div>
              {idaMode === "POR_PAX" ? (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Ida por passageiro</span>
                  <b className="tabular-nums">{fmtInt(idaInput)}</b>
                </div>
              ) : null}

              {tripKind === "IDA_VOLTA" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Pontos (volta)</span>
                    <b>{fmtInt(voltaTotalPoints)}</b>
                  </div>
                  {voltaMode === "POR_PAX" ? (
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Volta por passageiro</span>
                      <b className="tabular-nums">{fmtInt(voltaInput)}</b>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="flex justify-between">
                <span className="text-slate-600">Pontos (total)</span>
                <b>{fmtInt(pointsTotal)}</b>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-600">PAX</span>
                <b>{fmtInt(passengers)}</b>
              </div>

              <div className="h-px bg-slate-200 my-2" />

              <div className="flex justify-between">
                <span className="text-slate-600">Valor pontos</span>
                <b>{fmtMoneyBR(pointsValueCents)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Taxa embarque</span>
                <b>{fmtMoneyBR(embarqueFeeCents)}</b>
              </div>
              <div className="h-px bg-slate-200 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-600">Total</span>
                <b>{fmtMoneyBR(totalCents)}</b>
              </div>

              <div className="h-px bg-slate-200 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-600">Comissão (1%)</span>
                <b>{fmtMoneyBR(commissionCents)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Meta (compra)</span>
                <b>{metaMilheiroCents ? fmtMoneyBR(metaMilheiroCents) : "—"}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Bônus (30%)</span>
                <b>{fmtMoneyBR(bonusCents)}</b>
              </div>
            </div>

            <button
              type="button"
              onClick={openConfirmModal}
              disabled={!canSave || isSaving}
              className={cn(
                "mt-3 w-full rounded-xl px-4 py-2 text-sm text-white",
                !canSave || isSaving
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-black hover:bg-gray-800"
              )}
            >
              {isSaving ? "Salvando..." : "Salvar venda"}
            </button>

            <div className="text-xs text-slate-500">
              Comissão ignora taxa. Bônus = 30% do excedente acima da meta.
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ MODAL CADASTRO RÁPIDO */}
      {clienteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Cadastrar cliente</div>
                <div className="text-xs text-slate-500">
                  Cadastro rápido sem sair da venda.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClienteModalOpen(false)}
                className="rounded-lg border px-2 py-1 text-sm hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <div className="text-xs text-slate-600">Tipo</div>
                <select
                  className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                  value={novoCliente.tipo}
                  onChange={(e) =>
                    setNovoCliente((p) => ({
                      ...p,
                      tipo: e.target.value as ClienteTipo,
                    }))
                  }
                >
                  <option value="PESSOA">Pessoa</option>
                  <option value="EMPRESA">Empresa</option>
                </select>
              </label>

              <label className="space-y-1 md:col-span-2">
                <div className="text-xs text-slate-600">Nome</div>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  value={novoCliente.nome}
                  onChange={(e) =>
                    setNovoCliente((p) => ({ ...p, nome: e.target.value }))
                  }
                  placeholder="Nome do cliente / empresa"
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs text-slate-600">CPF/CNPJ (opcional)</div>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  value={novoCliente.cpfCnpj}
                  onChange={(e) =>
                    setNovoCliente((p) => ({ ...p, cpfCnpj: e.target.value }))
                  }
                  placeholder="Somente números ou com máscara"
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs text-slate-600">Telefone (opcional)</div>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  value={novoCliente.telefone}
                  onChange={(e) =>
                    setNovoCliente((p) => ({ ...p, telefone: e.target.value }))
                  }
                  placeholder="Somente números ou com máscara"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <div className="text-xs text-slate-600">Origem</div>
                <select
                  className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                  value={novoCliente.origem}
                  onChange={(e) =>
                    setNovoCliente((p) => ({
                      ...p,
                      origem: e.target.value as ClienteOrigem,
                    }))
                  }
                >
                  <option value="BALCAO_MILHAS">Balcão Milhas</option>
                  <option value="PARTICULAR">Particular</option>
                  <option value="SITE">Site</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </label>

              {novoCliente.origem === "OUTROS" ? (
                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">Descreva a origem</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={novoCliente.origemDescricao}
                    onChange={(e) =>
                      setNovoCliente((p) => ({
                        ...p,
                        origemDescricao: e.target.value,
                      }))
                    }
                    placeholder="Ex: Indicação, Instagram, etc."
                  />
                </label>
              ) : null}
            </div>

            {createClienteError ? (
              <div className="mt-3 text-sm text-rose-600">{createClienteError}</div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClienteModalOpen(false)}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={creatingCliente}
                onClick={criarClienteRapido}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm text-white",
                  creatingCliente
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-black hover:bg-gray-800"
                )}
              >
                {creatingCliente ? "Cadastrando..." : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ MODAL CONFIRMAR (antes de salvar) */}
      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Confirmar venda</div>
                <div className="text-xs text-slate-500">
                  Confira os dados antes de salvar.
                </div>
              </div>
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-lg border px-2 py-1 text-sm hover:bg-slate-50"
                disabled={isSaving}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Vendedor da venda</span>
                <b>{effectiveSellerLabel}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total</span>
                <b>{fmtMoneyBR(totalCents)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cartão da taxa</span>
                <b>{feeCardLabel || "—"}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Localizador</span>
                <b className="font-mono">{locator?.trim() || "—"}</b>
              </div>
              {program === "LATAM" || program === "SMILES" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Data ida</span>
                    <b>{departureDate || "—"}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Data volta</span>
                    <b>{returnDate || "—"}</b>
                  </div>
                  {program === "LATAM" ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Código compra</span>
                      <b className="font-mono">
                        {(purchaseCode || "").trim().toUpperCase() || "—"}
                      </b>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Sobrenome (1º pax)</span>
                    <b>{firstPassengerLastName.trim() || "—"}</b>
                  </div>
                  {program === "SMILES" ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Aeroporto ida</span>
                      <b className="font-mono">
                        {(departureAirportIata || "").trim().toUpperCase() || "—"}
                      </b>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="flex justify-between">
                <span className="text-slate-600">Programa</span>
                <b>{program}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Pontos</span>
                <b>{fmtInt(pointsTotal)}</b>
              </div>
            </div>

            {feeIsZero ? (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-medium">Taxa de embarque zerada</div>
                <div className="mt-1">
                  Confirme abaixo se esta venda realmente nao tera cobranca de taxa de embarque.
                </div>
                <label className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={confirmZeroFee}
                    onChange={(e) => setConfirmZeroFee(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    Confirmo que nao vou cobrar taxa de embarque nesta venda.
                  </span>
                </label>
              </div>
            ) : null}
            {passengerRisk ? (
              <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
                <div className="font-medium">Risco por PAX indisponivel</div>
                <div className="mt-1">
                  Esta venda excede o PAX disponivel e pode gerar bloqueio nas proximas 12h.
                </div>
                <label className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={confirmPassengerRisk}
                    onChange={(e) => setConfirmPassengerRisk(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    Estou ciente do risco de bloqueio nas proximas 12h e quero continuar com a venda.
                  </span>
                </label>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  closeConfirmModal();
                  await doSave();
                }}
                disabled={
                  !canSave ||
                  isSaving ||
                  (feeIsZero && !confirmZeroFee) ||
                  (passengerRisk && !confirmPassengerRisk)
                }
                className={cn(
                  "rounded-xl px-4 py-2 text-sm text-white",
                  !canSave ||
                    isSaving ||
                    (feeIsZero && !confirmZeroFee) ||
                    (passengerRisk && !confirmPassengerRisk)
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-black hover:bg-gray-800"
                )}
              >
                {isSaving
                  ? "Salvando..."
                  : feeIsZero
                    ? "Confirmar sem taxa e salvar"
                    : passengerRisk
                      ? "Confirmar risco e salvar"
                    : "Confirmar e salvar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ OVERLAY CENTRAL "SALVANDO..." */}
      {isSaving ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="rounded-2xl bg-white border px-5 py-4 shadow-sm flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
            <div className="text-sm font-medium">Salvando venda...</div>
          </div>
        </div>
      ) : null}

      {/* ✅ MODAL PÓS-SAVE (mensagem Telegram) */}
      {postSaveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">
                  Parabéns, sua passagem foi emitida com sucesso!
                </div>
                <div className="text-xs text-slate-500">
                  Copie a mensagem abaixo e cole no Telegram.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPostSaveOpen(false)}
                className="rounded-lg border px-2 py-1 text-sm hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs text-slate-600 mb-1">Mensagem</div>
              <textarea
                className="w-full min-h-[220px] rounded-xl border p-3 text-sm font-mono"
                value={postSaveMsg}
                onChange={(e) => setPostSaveMsg(e.target.value)}
              />
              <div className="mt-2 text-[11px] text-slate-500">
                Obs: está em Markdown (asteriscos). Se teu Telegram não formatar,
                ainda fica legível.
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => copyText("Mensagem Telegram", postSaveMsg)}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
              >
                Copiar mensagem
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(postSaveMsg);
                  } catch {}
                  window.location.href = "/dashboard/vendas";
                }}
                className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
              >
                Copiar e ir para vendas
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function CopyField({
  label,
  value,
  masked,
  onToggleMask,
  onCopy,
}: {
  label: string;
  value: string;
  masked?: boolean;
  onToggleMask?: () => void;
  onCopy: (value: string) => void;
}) {
  const showValue = masked ? (value ? "••••••••••" : "") : value;

  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className="flex items-center gap-2">
          {typeof masked === "boolean" ? (
            <button
              type="button"
              onClick={onToggleMask}
              className="text-[11px] underline text-slate-600 hover:text-slate-800"
            >
              {masked ? "Mostrar" : "Ocultar"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onCopy(value || "")}
            className="rounded-md border px-2 py-1 text-[11px] hover:bg-slate-50"
            title="Copiar"
          >
            Copiar
          </button>
        </div>
      </div>

      <div className="mt-1 font-mono text-sm text-slate-800 break-all">
        {showValue || <span className="text-slate-400">—</span>}
      </div>
    </div>
  );
}
