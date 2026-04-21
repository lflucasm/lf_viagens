"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Status = "ACTIVE" | "PAUSED" | "CANCELED";

type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ClubeRow = {
  id: string;
  team: string;
  cedenteId: string;
  program: Program;

  tierK: number;
  priceCents: number; // backend força 0 (não usamos no front)

  subscribedAt: string; // ISO
  renewalDay: number;

  lastRenewedAt: string | null;

  /**
   * ⚠️ backend novo:
   * - LATAM/SMILES: pointsExpireAt = "cancela em"
   * - LIVELO: pointsExpireAt = "inativa em" (permanente)
   * - ESFERA: null
   */
  pointsExpireAt: string | null;

  renewedThisCycle: boolean;

  status: Status;

  /**
   * ⚠️ backend novo:
   * - SMILES: smilesBonusEligibleAt = "pode aderir promo de novo"
   * - demais: null
   */
  smilesBonusEligibleAt: string | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;

  cedente: CedenteLite;
};

function isoToInputDate(iso: string | null) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

/**
 * Evita bug de timezone ao salvar date-only.
 * Envia sempre no meio-dia UTC (não “volta um dia” no backend).
 */
function inputDateToISO(v: string) {
  if (!v) return null;
  // YYYY-MM-DD -> YYYY-MM-DDT12:00:00Z
  const d = new Date(`${v}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function jfetch(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.ok) {
    throw new Error(json?.error || "Erro na requisição");
  }
  return json;
}

/* =========================
   Regras (mesmas do backend)
========================= */
const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;
const SMILES_CANCEL_AFTER_INACTIVE_DAYS = 60;

// ✅ backend atualizado: LIVELO inativa em 30 dias (base = lastRenewedAt ?? subscribedAt)
const LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS = 30;

function addDaysUTC(base: Date, days: number) {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysInMonthUTC(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function nextMonthOnDayUTC(base: Date, day: number) {
  const y0 = base.getUTCFullYear();
  const m0 = base.getUTCMonth();

  let y = y0;
  let m = m0 + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }

  const last = daysInMonthUTC(y, m);
  const dd = Math.min(Math.max(1, day), last);

  return new Date(Date.UTC(y, m, dd));
}

function toDateSafe(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateBR(iso: string | null) {
  const d = toDateSafe(iso);
  if (!d) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function computeAutoDates(
  row: Pick<ClubeRow, "program" | "subscribedAt" | "renewalDay" | "lastRenewedAt">
) {
  const program = row.program;
  const subscribedAt = toDateSafe(row.subscribedAt) || new Date();
  const renewalDay = Math.min(31, Math.max(1, Number(row.renewalDay) || 1));
  const lastRenewedAt = toDateSafe(row.lastRenewedAt);

  let nextRenewalAt: Date | null = null;
  let inactiveAt: Date | null = null;
  let cancelAtOrInativaAt: Date | null = null;

  if (program === "LATAM" || program === "SMILES") {
    const base = lastRenewedAt ?? subscribedAt;

    // ✅ sempre mês seguinte no dia renewalDay
    nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);
    inactiveAt = addDaysUTC(nextRenewalAt, 1);

    const cancelAfter =
      program === "LATAM"
        ? LATAM_CANCEL_AFTER_INACTIVE_DAYS
        : SMILES_CANCEL_AFTER_INACTIVE_DAYS;

    cancelAtOrInativaAt = addDaysUTC(inactiveAt, cancelAfter);
  } else if (program === "LIVELO") {
    // ✅ LIVELO: base = lastRenewedAt ?? subscribedAt; inativa em 30 dias
    const base = lastRenewedAt ?? subscribedAt;
    inactiveAt = addDaysUTC(base, LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS);
    cancelAtOrInativaAt = inactiveAt; // aqui é "inativa em" (permanente)
    nextRenewalAt = inactiveAt;
  } else {
    // ESFERA sem regra
  }

  return {
    nextRenewalAt,
    inactiveAt,
    cancelAtOrInativaAt,
  };
}

function dateToISO(d: Date | null) {
  return d ? d.toISOString() : null;
}

function clampTierK(n: number) {
  return Math.min(20, Math.max(1, n));
}

export default function ClubesClient({
  initialCedentes,
  initialClubes,
}: {
  initialCedentes: CedenteLite[];
  initialClubes: ClubeRow[];
}) {
  const searchParams = useSearchParams();
  const [cedentes, setCedentes] = useState<CedenteLite[]>(initialCedentes || []);
  const [clubes, setClubes] = useState<ClubeRow[]>(initialClubes || []);

  const [q, setQ] = useState("");
  const [filterProgram, setFilterProgram] = useState<"" | Program>("");
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm = useMemo(
    () => ({
      cedenteId: cedentes[0]?.id || "",
      program: "LATAM" as Program,
      tierK: 10,
      subscribedAt: isoToInputDate(new Date().toISOString()), // ✅ hoje (mas pode retroativo)
      renewalDay: 1,
      lastRenewedAt: "",
      renewedThisCycle: false,
      status: "ACTIVE" as Status,
      notes: "",
    }),
    [cedentes]
  );

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (editingId) return;

    const cedenteIdFromQuery = (searchParams.get("cedenteId") || "").trim();
    const programFromQuery = (searchParams.get("program") || "").trim().toUpperCase();

    const nextCedenteId = cedentes.some((c) => c.id === cedenteIdFromQuery)
      ? cedenteIdFromQuery
      : "";

    const nextProgram: Program | null =
      programFromQuery === "LATAM" ||
      programFromQuery === "SMILES" ||
      programFromQuery === "LIVELO" ||
      programFromQuery === "ESFERA"
        ? (programFromQuery as Program)
        : null;

    if (!nextCedenteId && !nextProgram) return;

    setForm((prev) => {
      const draft = { ...prev };
      let changed = false;

      if (nextCedenteId && prev.cedenteId !== nextCedenteId) {
        draft.cedenteId = nextCedenteId;
        changed = true;
      }

      if (nextProgram && prev.program !== nextProgram) {
        draft.program = nextProgram;
        changed = true;
      }

      return changed ? draft : prev;
    });
  }, [searchParams, cedentes, editingId]);

  useEffect(() => {
    setForm((f) => ({ ...emptyForm, ...f }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedentes.length]);

  // fallback cedentes
  useEffect(() => {
    if (cedentes.length > 0) return;

    (async () => {
      try {
        const json = await jfetch("/api/cedentes/approved");
        const list = Array.isArray(json?.data) ? json.data : [];
        const lite: CedenteLite[] = list.map((r: any) => ({
          id: r.id,
          identificador: r.identificador,
          nomeCompleto: r.nomeCompleto,
          cpf: r.cpf,
        }));
        setCedentes(lite);
      } catch {
        // sem crash
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decorated = useMemo(() => {
    return clubes.map((c) => {
      const auto = computeAutoDates(c);

      // Preferir o valor do backend quando existir (é a fonte de verdade)
      const backendCancelOrInativa = toDateSafe(c.pointsExpireAt);
      const cancelAtOrInativaAt = backendCancelOrInativa ?? auto.cancelAtOrInativaAt;

      return {
        ...c,
        _nextRenewalISO: dateToISO(auto.nextRenewalAt),
        _inactiveISO: dateToISO(auto.inactiveAt),
        _cancelOrInativaISO: dateToISO(cancelAtOrInativaAt),
      };
    });
  }, [clubes]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return decorated.filter((c) => {
      if (filterProgram && c.program !== filterProgram) return false;
      if (filterStatus && c.status !== filterStatus) return false;

      if (!qq) return true;

      const hay = [
        c.cedente?.nomeCompleto,
        c.cedente?.identificador,
        c.cedente?.cpf,
        c.program,
        c.notes || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [decorated, q, filterProgram, filterStatus]);

  function resetAlerts() {
    setErr(null);
    setMsg(null);
  }

  async function refresh() {
    resetAlerts();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProgram) params.set("program", filterProgram);
      if (filterStatus) params.set("status", filterStatus);
      if (q.trim()) params.set("q", q.trim());

      const qs = params.toString();
      const json = await jfetch(qs ? `/api/clubes?${qs}` : "/api/clubes");
      setClubes(json.items || []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    resetAlerts();
    setEditingId(null);
    setForm(emptyForm);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(row: ClubeRow) {
    resetAlerts();
    setEditingId(row.id);
    setForm({
      cedenteId: row.cedenteId,
      program: row.program,
      tierK: row.tierK,
      subscribedAt: isoToInputDate(row.subscribedAt),
      renewalDay: row.renewalDay,
      lastRenewedAt: isoToInputDate(row.lastRenewedAt),
      renewedThisCycle: row.renewedThisCycle,
      status: row.status,
      notes: row.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function markRenewedToday() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const v = `${yyyy}-${mm}-${dd}`;

    setForm((f) => ({
      ...f,
      lastRenewedAt: v,
      renewedThisCycle: true,
      status: "ACTIVE",
    }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    resetAlerts();
    setLoading(true);

    try {
      if (!cedentes.length) throw new Error("Você precisa cadastrar/importar cedentes primeiro.");
      if (!form.cedenteId) throw new Error("Escolha um cedente");

      const subscribedAtISO = inputDateToISO(form.subscribedAt);
      if (!subscribedAtISO) throw new Error("Data de assinatura inválida");

      const payload: any = {
        cedenteId: form.cedenteId,
        program: form.program,
        tierK: clampTierK(Number(form.tierK) || 10),
        subscribedAt: subscribedAtISO,
        renewalDay: Math.min(31, Math.max(1, Number(form.renewalDay) || 1)),
        lastRenewedAt: form.lastRenewedAt ? inputDateToISO(form.lastRenewedAt) : null,
        renewedThisCycle: Boolean(form.renewedThisCycle),
        status: form.status,
        notes: form.notes?.trim().slice(0, 500) || null,
        // ✅ NÃO enviar: priceCents, pointsExpireAt, smilesBonusEligibleAt (automáticos)
      };

      if (!editingId) {
        const json = await jfetch("/api/clubes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setClubes((prev) => [json.item, ...prev]);
        setMsg("Clube criado ✅");
        setForm(emptyForm);
      } else {
        const json = await jfetch(`/api/clubes/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setClubes((prev) => prev.map((c) => (c.id === editingId ? json.item : c)));
        setMsg("Clube atualizado ✅");
      }
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function onCancel(row: ClubeRow) {
    resetAlerts();
    setLoading(true);
    try {
      const json = await jfetch(`/api/clubes/${row.id}`, { method: "DELETE" });
      // soft cancel retorna {item}; hard delete retorna {deleted:true}
      if (json?.item) {
        setClubes((prev) => prev.map((c) => (c.id === row.id ? json.item : c)));
      } else {
        setClubes((prev) => prev.filter((c) => c.id !== row.id));
      }
      setMsg("Clube cancelado ✅");
    } catch (e: any) {
      setErr(e?.message || "Erro ao cancelar");
    } finally {
      setLoading(false);
    }
  }

  async function onHardDelete(row: ClubeRow) {
    resetAlerts();

    if (row.status !== "CANCELED") {
      setErr("Só é possível excluir definitivamente um registro CANCELADO.");
      return;
    }

    const ok = window.confirm(
      "Excluir definitivamente este registro?\n\nIsso remove do banco e NÃO tem como desfazer."
    );
    if (!ok) return;

    setLoading(true);
    try {
      await jfetch(`/api/clubes/${row.id}?hard=1`, { method: "DELETE" });
      setClubes((prev) => prev.filter((c) => c.id !== row.id));
      setMsg("Registro excluído definitivamente ✅");
    } catch (e: any) {
      setErr(e?.message || "Erro ao excluir definitivamente");
    } finally {
      setLoading(false);
    }
  }

  const tierOptions = useMemo(() => Array.from({ length: 20 }, (_, i) => i + 1), []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clubes</h1>
          <p className="text-sm text-neutral-500">
            Assinaturas por cedente. Datas de inativação/cancelamento são automáticas por regra.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={startCreate}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-60"
            type="button"
            disabled={loading}
          >
            Novo clube
          </button>
          <button
            onClick={refresh}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            type="button"
          >
            {loading ? "Carregando..." : "Recarregar"}
          </button>
        </div>
      </div>

      {(msg || err) && (
        <div
          className={[
            "rounded-xl border px-3 py-2 text-sm",
            err
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700",
          ].join(" ")}
        >
          {err || msg}
        </div>
      )}

      {/* Form */}
      <form onSubmit={onSave} className="rounded-2xl border p-4 space-y-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{editingId ? "Editar clube" : "Cadastrar clube"}</h2>

          <div className="flex items-center gap-2">
            {(form.program === "LATAM" || form.program === "SMILES") && (
              <button
                type="button"
                onClick={markRenewedToday}
                className="rounded-xl border px-3 py-2 text-xs hover:bg-neutral-50 disabled:opacity-60"
                disabled={loading}
                title="Preenche última renovação com hoje e marca como renovado neste ciclo"
              >
                Marcar renovado hoje
              </button>
            )}

            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="text-xs text-neutral-500 hover:text-neutral-800 disabled:opacity-60"
                disabled={loading}
              >
                sair do modo edição
              </button>
            )}
          </div>
        </div>

        {!cedentes.length && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            Nenhum cedente disponível. Importe/cadastre cedentes primeiro.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-neutral-600">
            Cedente
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              value={form.cedenteId}
              onChange={(e) => setForm((f) => ({ ...f, cedenteId: e.target.value }))}
              disabled={!cedentes.length || loading}
            >
              {cedentes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto} — {c.identificador}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-neutral-600">
            Programa
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              value={form.program}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  program: e.target.value as Program,
                }))
              }
              disabled={loading}
            >
              <option value="LATAM">LATAM</option>
              <option value="SMILES">SMILES</option>
              <option value="LIVELO">LIVELO</option>
              <option value="ESFERA">ESFERA</option>
            </select>
          </label>

          <label className="text-xs text-neutral-600">
            Status
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}
              disabled={loading}
            >
              <option value="ACTIVE">ATIVO</option>
              <option value="PAUSED">PAUSADO</option>
              <option value="CANCELED">CANCELADO</option>
            </select>
            <div className="mt-1 text-[11px] text-neutral-400">
              *O backend pode rebaixar automaticamente (ACTIVE→PAUSED→CANCELED) conforme as regras.
            </div>
          </label>

          <label className="text-xs text-neutral-600">
            Tier (K) (1k..20k)
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              value={String(form.tierK)}
              onChange={(e) => setForm((f) => ({ ...f, tierK: Number(e.target.value) }))}
              disabled={loading}
            >
              {tierOptions.map((k) => (
                <option key={k} value={k}>
                  {k}k
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-neutral-600">
            Assinado em
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              type="date"
              value={form.subscribedAt}
              onChange={(e) => setForm((f) => ({ ...f, subscribedAt: e.target.value }))}
              disabled={loading}
            />
          </label>

          <label className="text-xs text-neutral-600">
            Dia renovação (1-31)
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              type="number"
              min={1}
              max={31}
              value={form.renewalDay}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  renewalDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                }))
              }
              disabled={loading}
            />
            <div className="mt-1 text-[11px] text-neutral-400">
              *LATAM/SMILES: a inativação começa no dia seguinte à renovação do mês seguinte.
            </div>
          </label>

          <label className="text-xs text-neutral-600">
            Última renovação (opcional)
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              type="date"
              value={form.lastRenewedAt}
              onChange={(e) => setForm((f) => ({ ...f, lastRenewedAt: e.target.value }))}
              disabled={loading}
            />
          </label>

          <label className="text-xs text-neutral-600 flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.renewedThisCycle}
              onChange={(e) => setForm((f) => ({ ...f, renewedThisCycle: e.target.checked }))}
              disabled={loading}
            />
            Renovou neste ciclo
          </label>

          <label className="text-xs text-neutral-600 md:col-span-3">
            Observações (opcional)
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm min-h-[70px] disabled:opacity-60"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              disabled={loading}
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading || !cedentes.length}
          >
            {loading ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar"}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="rounded-2xl border p-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
            placeholder="Buscar (nome, identificador, cpf, obs...)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={loading}
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value as any)}
            disabled={loading}
          >
            <option value="">Todos programas</option>
            <option value="LATAM">LATAM</option>
            <option value="SMILES">SMILES</option>
            <option value="LIVELO">LIVELO</option>
            <option value="ESFERA">ESFERA</option>
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            disabled={loading}
          >
            <option value="">Todos status</option>
            <option value="ACTIVE">ATIVO</option>
            <option value="PAUSED">PAUSADO</option>
            <option value="CANCELED">CANCELADO</option>
          </select>

          <button
            onClick={refresh}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            type="button"
          >
            Aplicar filtros
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-medium">
            Registros: <span className="text-neutral-600">{filtered.length}</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-4 py-2">Cedente</th>
                <th className="text-left px-4 py-2">Programa</th>
                <th className="text-left px-4 py-2">Tier</th>
                <th className="text-left px-4 py-2">Assinatura</th>
                <th className="text-left px-4 py-2">Próx. renov.</th>
                <th className="text-left px-4 py-2">Inativa em</th>
                <th className="text-left px-4 py-2">Cancela / Inativa</th>
                <th className="text-left px-4 py-2">Promo SMILES</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filtered.map((c: any) => {
                const nextLabel =
                  c.program === "LATAM" || c.program === "SMILES"
                    ? fmtDateBR(c._nextRenewalISO)
                    : "-";

                const inactiveLabel =
                  c.program === "LATAM" || c.program === "SMILES" || c.program === "LIVELO"
                    ? fmtDateBR(c._inactiveISO)
                    : "-";

                const cancelOrInativaLabel = c.program === "ESFERA" ? "-" : fmtDateBR(c._cancelOrInativaISO);

                const cancelOrInativaTitle =
                  c.program === "LIVELO"
                    ? "Data em que fica inativo (permanente)"
                    : "Data em que cancela automaticamente";

                return (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.cedente?.nomeCompleto}</div>
                      <div className="text-xs text-neutral-500">
                        {c.cedente?.identificador} • CPF {c.cedente?.cpf}
                      </div>
                    </td>

                    <td className="px-4 py-2 font-medium">{c.program}</td>

                    <td className="px-4 py-2">{c.tierK}k</td>

                    <td className="px-4 py-2">{fmtDateBR(c.subscribedAt)}</td>

                    <td className="px-4 py-2">{nextLabel}</td>

                    <td className="px-4 py-2">{inactiveLabel}</td>

                    <td className="px-4 py-2" title={cancelOrInativaTitle}>
                      {cancelOrInativaLabel}
                    </td>

                    <td className="px-4 py-2">
                      {c.program === "SMILES" && c.smilesBonusEligibleAt
                        ? fmtDateBR(c.smilesBonusEligibleAt)
                        : "-"}
                    </td>

                    <td className="px-4 py-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                          c.status === "ACTIVE"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : c.status === "PAUSED"
                            ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                            : "border-red-200 bg-red-50 text-red-700",
                        ].join(" ")}
                      >
                        {c.status}
                      </span>
                    </td>

                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-white disabled:opacity-60"
                        disabled={loading}
                      >
                        Editar
                      </button>

                      {c.status !== "CANCELED" && (
                        <button
                          type="button"
                          onClick={() => onCancel(c)}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-white disabled:opacity-60"
                          disabled={loading}
                        >
                          Cancelar
                        </button>
                      )}

                      {c.status === "CANCELED" && (
                        <button
                          type="button"
                          onClick={() => onHardDelete(c)}
                          className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                          disabled={loading}
                          title="Excluir definitivamente (remove do banco)"
                        >
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={10}>
                    Nenhum clube encontrado.
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
