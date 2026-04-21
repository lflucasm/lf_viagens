"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Payment = { id: string; amountCents: number; note?: string | null; paidAt: string };
type Debt = {
  id: string;
  title: string;
  description?: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  status: "OPEN" | "PAID" | "CANCELED";
  creditorName?: string | null;
  dueDate?: string | null;
  payOrder?: number | null;
  createdAt: string;
  payments: Payment[];
};

type CreditorGroup = {
  key: string;
  name: string;
  debts: Debt[];
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  openCount: number;
  nextDueDate: string | null;
};

const EMPTY_CREDITOR_KEY = "__SEM_PESSOA__";

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dateTimeBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}
function dateBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}
function toISODateInput(v?: string | null) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysDiffFromToday(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = startOfDay(new Date());
  const due = startOfDay(d);
  const diffMs = due.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
function dueLabel(diff: number) {
  if (diff < 0) return `Atrasada ${Math.abs(diff)}d`;
  if (diff === 0) return "Vence hoje";
  if (diff === 1) return "Vence amanhã";
  return `Vence em ${diff}d`;
}
function dueTone(diff: number) {
  if (diff < 0) return "border-red-200 bg-red-50 text-red-700";
  if (diff === 0) return "border-amber-200 bg-amber-50 text-amber-700";
  if (diff === 1) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-yellow-200 bg-yellow-50 text-yellow-700";
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function debtStatusBadgeTone(status: Debt["status"]) {
  if (status === "PAID") return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (status === "OPEN") return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-slate-100 border-slate-200 text-slate-600";
}

function debtCardTone(status: Debt["status"]) {
  if (status === "PAID") return "border-emerald-100 bg-emerald-50/30";
  if (status === "OPEN") return "border-slate-200 bg-white";
  return "border-slate-200 bg-slate-50/60";
}

// ===== ordenação/status helpers =====
const statusRank: Record<Debt["status"], number> = {
  OPEN: 0,
  PAID: 1,
  CANCELED: 2,
};

type StatusFilter = "ALL" | "OPEN" | "PAID";
type SortMode =
  | "DUE_SOON"
  | "NEWEST"
  | "OLDEST"
  | "BALANCE_DESC"
  | "BALANCE_ASC"
  | "TOTAL_DESC"
  | "TOTAL_ASC";

export default function DividasClient() {
  const [loading, setLoading] = useState(false);
  const [debts, setDebts] = useState<Debt[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [creditorName, setCreditorName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [payOrder, setPayOrder] = useState("");

  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [payNote, setPayNote] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      { creditorName: string; dueDate: string; payOrder: string; description: string }
    >
  >({});

  const [meRole, setMeRole] = useState<"admin" | "staff" | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [payingGroupKey, setPayingGroupKey] = useState<string | null>(null);

  // ✅ filtros/ordenação
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("DUE_SOON");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/dividas", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar dívidas");
      setDebts(j.data || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/session", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (j?.ok && j?.hasSession && j?.user?.role) {
          setMeRole(j.user.role);
        } else {
          setMeRole(null);
        }
      } catch {
        setMeRole(null);
      }
    })();
  }, []);

  const totals = useMemo(() => {
    const totalCents = debts.reduce((a, d) => a + (d.totalCents || 0), 0);
    const paidCents = debts.reduce((a, d) => a + (d.paidCents || 0), 0);
    const balanceCents = debts.reduce((a, d) => a + (d.balanceCents || 0), 0);
    return { totalCents, paidCents, balanceCents };
  }, [debts]);

  const filtered = useMemo(() => {
    let arr = [...debts];
    if (statusFilter !== "ALL") {
      arr = arr.filter((d) => d.status === statusFilter);
    }
    return arr;
  }, [debts, statusFilter]);

  const grouped = useMemo<CreditorGroup[]>(() => {
    const map = new Map<string, CreditorGroup>();

    for (const d of filtered) {
      const key = (d.creditorName || "").trim();
      const name = key || "Sem pessoa";
      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          debts: [],
          totalCents: 0,
          paidCents: 0,
          balanceCents: 0,
          openCount: 0,
          nextDueDate: null,
        });
      }
      const g = map.get(key)!;
      g.debts.push(d);
      g.totalCents += d.totalCents || 0;
      g.paidCents += d.paidCents || 0;
      g.balanceCents += d.balanceCents || 0;
      if (d.status === "OPEN") {
        g.openCount += 1;
        if (d.dueDate) {
          const dueTs = new Date(d.dueDate).getTime();
          const currentTs = g.nextDueDate ? new Date(g.nextDueDate).getTime() : Number.POSITIVE_INFINITY;
          if (Number.isFinite(dueTs) && dueTs < currentTs) {
            g.nextDueDate = d.dueDate;
          }
        }
      }
    }

    const groups = Array.from(map.values());

    function dueValue(d: Debt) {
      if (!d.dueDate) return Number.POSITIVE_INFINITY;
      const t = new Date(d.dueDate).getTime();
      return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    }

    function sortDebts(a: Debt, b: Debt) {
      const ra = statusRank[a.status] ?? 99;
      const rb = statusRank[b.status] ?? 99;
      if (ra !== rb) return ra - rb;

      switch (sortMode) {
        case "DUE_SOON": {
          const da = dueValue(a);
          const db = dueValue(b);
          if (da !== db) return da - db;
          break;
        }
        case "BALANCE_ASC":
          if ((a.balanceCents || 0) !== (b.balanceCents || 0))
            return (a.balanceCents || 0) - (b.balanceCents || 0);
          break;
        case "BALANCE_DESC":
          if ((a.balanceCents || 0) !== (b.balanceCents || 0))
            return (b.balanceCents || 0) - (a.balanceCents || 0);
          break;
        case "TOTAL_ASC":
          if ((a.totalCents || 0) !== (b.totalCents || 0))
            return (a.totalCents || 0) - (b.totalCents || 0);
          break;
        case "TOTAL_DESC":
          if ((a.totalCents || 0) !== (b.totalCents || 0))
            return (b.totalCents || 0) - (a.totalCents || 0);
          break;
        case "NEWEST": {
          const da = new Date(a.createdAt).getTime();
          const db = new Date(b.createdAt).getTime();
          if (da !== db) return db - da;
          break;
        }
        case "OLDEST": {
          const da = new Date(a.createdAt).getTime();
          const db = new Date(b.createdAt).getTime();
          if (da !== db) return da - db;
          break;
        }
      }

      // preferência por ordem definida
      const oa = typeof a.payOrder === "number" ? a.payOrder : Number.POSITIVE_INFINITY;
      const ob = typeof b.payOrder === "number" ? b.payOrder : Number.POSITIVE_INFINITY;
      if (oa !== ob) return oa - ob;

      const ca = new Date(a.createdAt).getTime();
      const cb = new Date(b.createdAt).getTime();
      return ca - cb;
    }

    for (const g of groups) {
      g.debts.sort(sortDebts);
    }

    function groupDueValue(g: CreditorGroup) {
      if (!g.nextDueDate) return Number.POSITIVE_INFINITY;
      return dueValue({ dueDate: g.nextDueDate } as Debt);
    }

    groups.sort((a, b) => {
      const aOpen = a.debts.some((d) => d.status === "OPEN");
      const bOpen = b.debts.some((d) => d.status === "OPEN");
      if (aOpen !== bOpen) return aOpen ? -1 : 1;

      switch (sortMode) {
        case "DUE_SOON": {
          const da = groupDueValue(a);
          const db = groupDueValue(b);
          if (da !== db) return da - db;
          break;
        }
        case "BALANCE_ASC":
          if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
          break;
        case "BALANCE_DESC":
          if (a.balanceCents !== b.balanceCents) return b.balanceCents - a.balanceCents;
          break;
        case "TOTAL_ASC":
          if (a.totalCents !== b.totalCents) return a.totalCents - b.totalCents;
          break;
        case "TOTAL_DESC":
          if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
          break;
        case "NEWEST": {
          const da = Math.max(...a.debts.map((d) => new Date(d.createdAt).getTime()));
          const db = Math.max(...b.debts.map((d) => new Date(d.createdAt).getTime()));
          if (da !== db) return db - da;
          break;
        }
        case "OLDEST": {
          const da = Math.min(...a.debts.map((d) => new Date(d.createdAt).getTime()));
          const db = Math.min(...b.debts.map((d) => new Date(d.createdAt).getTime()));
          if (da !== db) return da - db;
          break;
        }
      }

      return a.name.localeCompare(b.name, "pt-BR");
    });

    return groups;
  }, [filtered, sortMode]);

  const visibleGroups = useMemo(() => {
    if (statusFilter === "PAID") return grouped;
    return grouped.filter((g) => g.openCount > 0 && g.balanceCents > 0);
  }, [grouped, statusFilter]);

  function groupActionKey(groupKey: string) {
    return groupKey || EMPTY_CREDITOR_KEY;
  }

  function toggleGroup(groupKey: string) {
    const key = groupActionKey(groupKey);
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const isAdmin = meRole === "admin";

  const dueAlerts = useMemo(() => {
    if (!isAdmin) return [];
    return debts
      .filter((d) => d.status === "OPEN" && d.dueDate)
      .map((d) => {
        const diff = daysDiffFromToday(d.dueDate || null);
        return { debt: d, diff };
      })
      .filter((x) => typeof x.diff === "number" && (x.diff! <= 2 || x.diff! < 0))
      .sort((a, b) => {
        const da = a.diff ?? 9999;
        const db = b.diff ?? 9999;
        if (da !== db) return da - db;
        return (a.debt.balanceCents || 0) - (b.debt.balanceCents || 0);
      });
  }, [debts, isAdmin]);

  const creditorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of debts) {
      const name = String(d.creditorName || "").trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [debts]);

  async function createDebt() {
    const cents = toCentsFromInput(total);
    if (!title.trim()) return alert("Informe a descrição/título.");
    if (cents <= 0) return alert("Valor inválido.");

    setLoading(true);
    try {
      const r = await fetch("/api/dividas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          total,
          creditorName: creditorName || null,
          dueDate: dueDate || null,
          payOrder: payOrder || null,
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao criar dívida");
      setTitle("");
      setDescription("");
      setTotal("");
      setCreditorName("");
      setDueDate("");
      setPayOrder("");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addPayment(debtId: string) {
    const amount = payAmount[debtId] || "";
    const note = payNote[debtId] || "";
    const cents = toCentsFromInput(amount);
    if (cents <= 0) return alert("Pagamento inválido.");

    setLoading(true);
    try {
      const r = await fetch(`/api/dividas/${debtId}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao registrar pagamento");

      setPayAmount((prev) => ({ ...prev, [debtId]: "" }));
      setPayNote((prev) => ({ ...prev, [debtId]: "" }));
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function payCreditorGroup(group: CreditorGroup) {
    const actionKey = groupActionKey(group.key);
    if (group.balanceCents <= 0 || group.openCount <= 0) return;
    const confirmed = window.confirm(
      `Quitar todas as ${group.openCount} dívida(s) abertas de ${group.name} por ${fmtMoney(group.balanceCents)}?`
    );
    if (!confirmed) return;

    setPayingGroupKey(actionKey);
    try {
      const r = await fetch("/api/dividas/pagar-credor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupKey: actionKey,
          note: `Quitação em lote de ${group.name}`,
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao quitar credor");
      await load();
      alert(
        `${group.name}: ${j?.data?.debtsCount || group.openCount} dívida(s) quitada(s), total ${fmtMoney(
          j?.data?.totalPaidCents || group.balanceCents
        )}.`
      );
    } catch (e: any) {
      alert(e.message || "Erro ao quitar dívidas do credor.");
    } finally {
      setPayingGroupKey(null);
    }
  }

  function startEdit(d: Debt) {
    setEditingId(d.id);
    setDrafts((prev) => ({
      ...prev,
      [d.id]: {
        creditorName: d.creditorName || "",
        dueDate: toISODateInput(d.dueDate || null),
        payOrder: typeof d.payOrder === "number" ? String(d.payOrder) : "",
        description: d.description || "",
      },
    }));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(debtId: string) {
    const draft = drafts[debtId];
    if (!draft) return;

    setLoading(true);
    try {
      const r = await fetch(`/api/dividas/${debtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditorName: draft.creditorName || null,
          dueDate: draft.dueDate || null,
          payOrder: draft.payOrder || null,
          description: draft.description || null,
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao atualizar dívida");
      setEditingId(null);
      await load();
    } catch (e: any) {
      alert(e.message || "Erro ao atualizar.");
    } finally {
      setLoading(false);
    }
  }

  function renderGroupDetails(g: CreditorGroup) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">{g.name}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {g.debts.length} dívida(s) • {g.openCount} aberta(s)
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Saldo total</div>
            <div className="font-semibold text-amber-700">{fmtMoney(g.balanceCents)}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-600">Total</div>
            <div className="text-sm font-semibold text-slate-900">{fmtMoney(g.totalCents)}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="text-xs text-slate-600">Pago</div>
            <div className="text-sm font-semibold text-emerald-800">{fmtMoney(g.paidCents)}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <div className="text-xs text-slate-600">Saldo</div>
            <div className="text-sm font-semibold text-amber-800">{fmtMoney(g.balanceCents)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-600">Próx. vencimento</div>
            <div className="text-sm font-semibold text-slate-900">{dateBR(g.nextDueDate)}</div>
          </div>
        </div>

        <div className="space-y-3">
          {g.debts.map((d) => {
            const isEditing = editingId === d.id;
            const draft = drafts[d.id];
            const diff = daysDiffFromToday(d.dueDate || null);
            const canEdit = d.status === "OPEN";

            return (
              <div key={d.id} className={cn("space-y-3 rounded-xl border p-4", debtCardTone(d.status))}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">
                      {d.title}{" "}
                      <span
                        className={cn("rounded-full border px-2 py-1 text-xs", debtStatusBadgeTone(d.status))}
                      >
                        {d.status === "PAID" ? "Quitada" : d.status === "OPEN" ? "Aberta" : "Cancelada"}
                      </span>
                    </div>
                    {d.description ? <div className="text-sm text-slate-600">{d.description}</div> : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border px-2 py-1">
                        Vencimento: {dateBR(d.dueDate || null)}
                      </span>
                      {typeof d.payOrder === "number" ? (
                        <span className="rounded-full border px-2 py-1">Ordem: {d.payOrder}</span>
                      ) : null}
                      {typeof diff === "number" ? (
                        <span className={`rounded-full border px-2 py-1 ${dueTone(diff)}`}>{dueLabel(diff)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-600">Total</div>
                    <div className="font-semibold text-slate-900">{fmtMoney(d.totalCents)}</div>
                    {canEdit ? (
                      <button
                        onClick={() => startEdit(d)}
                        className="mt-2 rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        Editar dados
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing && draft ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-2 md:grid-cols-4">
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Pessoa (credor)"
                        value={draft.creditorName}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [d.id]: { ...draft, creditorName: e.target.value },
                          }))
                        }
                      />
                      <input
                        type="date"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={draft.dueDate}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [d.id]: { ...draft, dueDate: e.target.value },
                          }))
                        }
                      />
                      <input
                        type="number"
                        min={1}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Ordem"
                        value={draft.payOrder}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [d.id]: { ...draft, payOrder: e.target.value },
                          }))
                        }
                      />
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Descrição (opcional)"
                        value={draft.description}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [d.id]: { ...draft, description: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(d.id)}
                        className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
                        disabled={loading}
                      >
                        Salvar
                      </button>
                      <button onClick={cancelEdit} className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-600">Pago</div>
                    <div className="text-sm font-semibold">{fmtMoney(d.paidCents)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-600">Saldo</div>
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        d.balanceCents > 0 ? "text-amber-700" : "text-emerald-700"
                      )}
                    >
                      {fmtMoney(d.balanceCents)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-600">Pagamentos</div>
                    <div className="text-sm font-semibold">{d.payments.length}</div>
                  </div>
                </div>

                {d.status !== "PAID" && d.status !== "CANCELED" ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold">Adicionar pagamento</div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Valor (ex: 200,00)"
                        value={payAmount[d.id] ?? ""}
                        onChange={(e) => setPayAmount((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      />
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Obs (opcional)"
                        value={payNote[d.id] ?? ""}
                        onChange={(e) => setPayNote((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => addPayment(d.id)}
                        className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
                        disabled={loading}
                      >
                        Registrar
                      </button>
                    </div>
                    <div className="text-xs text-slate-600">* grava automaticamente data e hora do registro.</div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="text-sm font-semibold">Histórico</div>
                  {d.payments.length === 0 ? (
                    <div className="text-sm text-slate-600">Nenhum pagamento registrado.</div>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded-xl border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Data/hora</th>
                            <th className="px-3 py-2 text-right">Valor</th>
                            <th className="px-3 py-2 text-left">Obs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.payments.map((p) => (
                            <tr key={p.id} className="border-t">
                              <td className="px-3 py-2">{dateTimeBR(p.paidAt)}</td>
                              <td className="px-3 py-2 text-right">{fmtMoney(p.amountCents)}</td>
                              <td className="px-3 py-2">{p.note || "-"}</td>
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dívidas</h1>
            <p className="text-sm text-slate-600">Organize por pessoa, priorize vencimentos e registre pagamentos.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              {filtered.length} item(ns) no filtro
            </div>
            <button
              onClick={load}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              disabled={loading}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total em dívidas</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{fmtMoney(totals.totalCents)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Total pago</div>
          <div className="mt-1 text-2xl font-bold text-emerald-900">{fmtMoney(totals.paidCents)}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-amber-700">Saldo em aberto</div>
          <div className="mt-1 text-2xl font-bold text-amber-900">{fmtMoney(totals.balanceCents)}</div>
        </div>
      </div>

      {/* ✅ Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="ALL">Todas</option>
              <option value="OPEN">Abertas</option>
              <option value="PAID">Quitadas</option>
            </select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ordenação</div>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              <option value="DUE_SOON">Vencimento mais próximo</option>
              <option value="BALANCE_DESC">Maior saldo</option>
              <option value="BALANCE_ASC">Menor saldo</option>
              <option value="NEWEST">Mais recentes</option>
              <option value="OLDEST">Mais antigas</option>
              <option value="TOTAL_DESC">Maior total</option>
              <option value="TOTAL_ASC">Menor total</option>
            </select>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Abertas sempre ficam no topo. Depois aplica a ordenação selecionada.
        </div>
      </div>

      {isAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-slate-900">Alertas de vencimento</div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              {dueAlerts.length} alerta(s)
            </div>
          </div>
          {dueAlerts.length === 0 ? (
            <div className="mt-2 text-sm text-slate-600">Nenhuma dívida com alerta de vencimento.</div>
          ) : (
            <div className="mt-3 grid gap-2">
              {dueAlerts.map(({ debt, diff }) => (
                <div
                  key={debt.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3",
                    diff != null && diff < 0 ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"
                  )}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{debt.title}</div>
                    <div className="text-xs text-slate-600">
                      {debt.creditorName ? `Pessoa: ${debt.creditorName}` : "Pessoa: —"} • Vencimento:{" "}
                      {dateBR(debt.dueDate || null)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-xs px-2 py-1 rounded-full border ${dueTone(diff || 0)}`}>
                      {dueLabel(diff || 0)}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{fmtMoney(debt.balanceCents)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Criar dívida */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-slate-900">Adicionar dívida</div>
          <div className="text-xs text-slate-500">Campos com * são recomendados para organização</div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-600">Descrição (título) *</div>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Cartão Inter / 123milhas / Empréstimo..."
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-600">Valor total (R$) *</div>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="Ex: 1500,00"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-600">Detalhes (opcional)</div>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: parcela 3/10, juros, etc."
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-600">Pessoa (credor)</div>
            <div className="space-y-2">
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={creditorOptions.includes(creditorName.trim()) ? creditorName.trim() : ""}
                onChange={(e) => setCreditorName(e.target.value)}
              >
                <option value="">Selecionar credor já cadastrado...</option>
                {creditorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={creditorName}
                onChange={(e) => setCreditorName(e.target.value)}
                placeholder="Ou digite um novo credor (ex: Joyce)"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-600">Vencimento</div>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-600">Ordem de pagamento (opcional)</div>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              value={payOrder}
              onChange={(e) => setPayOrder(e.target.value)}
              placeholder="Ex: 1"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={createDebt}
            className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
            disabled={loading}
          >
            Adicionar dívida
          </button>
        </div>
      </div>

      {/* Resumo por credor */}
      {visibleGroups.length === 0 ? (
        <div className="text-sm text-slate-600">
          Nenhuma dívida encontrada para o filtro atual.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900">Resumo por credor</div>
                <div className="text-sm text-slate-600">
                  Veja quanto deve para cada pessoa e abra somente o que quiser detalhar.
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                {visibleGroups.length} credor(es)
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="rounded-l-xl px-3 py-2 font-medium">Credor</th>
                    <th className="px-3 py-2 font-medium">Dívidas</th>
                    <th className="px-3 py-2 font-medium">Próx. vencimento</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-right">Pago</th>
                    <th className="px-3 py-2 font-medium text-right">Saldo</th>
                    <th className="rounded-r-xl px-3 py-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((g) => {
                    const actionKey = groupActionKey(g.key);
                    const isExpanded = !!expandedGroups[actionKey];
                    return (
                      <Fragment key={actionKey}>
                        <tr className="border-t border-slate-100 align-top">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-900">{g.name}</div>
                            <div className="text-xs text-slate-500">
                              {g.debts.length} dívida(s) • {g.openCount} aberta(s)
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{g.debts.length}</td>
                          <td className="px-3 py-3 text-slate-700">{dateBR(g.nextDueDate)}</td>
                          <td className="px-3 py-3 text-right font-medium text-slate-900">{fmtMoney(g.totalCents)}</td>
                          <td className="px-3 py-3 text-right font-medium text-emerald-700">{fmtMoney(g.paidCents)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-amber-700">{fmtMoney(g.balanceCents)}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                onClick={() => toggleGroup(g.key)}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                              >
                                {isExpanded ? "Fechar detalhes" : "Abrir detalhes"}
                              </button>
                              <button
                                onClick={() => payCreditorGroup(g)}
                                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={
                                  loading || payingGroupKey === actionKey || g.balanceCents <= 0 || g.openCount === 0
                                }
                              >
                                {payingGroupKey === actionKey ? "Quitando..." : "Quitar tudo"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-t border-slate-100 bg-slate-50/40">
                            <td colSpan={7} className="px-3 py-4">
                              {renderGroupDetails(g)}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
