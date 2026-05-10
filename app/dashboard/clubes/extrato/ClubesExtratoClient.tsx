"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
const PROGRAMS: Program[] = ["LATAM", "SMILES", "LIVELO", "ESFERA"];

type CedenteMini = { id: string; identificador: string; nomeCompleto: string; cpf: string };

type InvItem = {
  program: Program;
  cedentePoints: number;
  inventoryPoints: number;
  costBasisCents: number;
  avgMilheiroCents: number;
  usesInventoryAvg: boolean;
};

type LedgerEntry = {
  id: string;
  kind: string;
  program: Program;
  pointsDelta: number;
  costDeltaCents: number;
  bonusPoints: number;
  peerProgram: Program | null;
  note: string | null;
  occurredAt: string;
};

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

function kindPt(k: string) {
  const m: Record<string, string> = {
    POINTS_PURCHASE: "Compra pontos",
    CLUB_MONTHLY_CREDIT: "Clube (renovação)",
    BONUS: "Bônus",
    TRANSFER_OUT: "Transferência (saída)",
    TRANSFER_IN: "Transferência (entrada)",
    SALE: "Venda",
    ADJUSTMENT: "Ajuste",
  };
  return m[k] || k;
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  const json = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!r.ok || !json || json.ok === false) {
    throw new Error((json as { error?: string })?.error || `Erro ${r.status}`);
  }
  return json as T;
}

function parseCentsReais(input: string): number {
  const s = String(input || "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

export default function ClubesExtratoClient() {
  const [cedentes, setCedentes] = useState<CedenteMini[]>([]);
  const [cedenteId, setCedenteId] = useState("");
  const [program, setProgram] = useState<Program>("LATAM");
  const [inventory, setInventory] = useState<InvItem[] | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [purchasePts, setPurchasePts] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchaseBonus, setPurchaseBonus] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");

  const [bonusPts, setBonusPts] = useState("");
  const [bonusNote, setBonusNote] = useState("");

  const [xferFrom, setXferFrom] = useState<Program>("LIVELO");
  const [xferTo, setXferTo] = useState<Program>("LATAM");
  const [xferPts, setXferPts] = useState("");
  const [xferBonus, setXferBonus] = useState("");
  const [xferNote, setXferNote] = useState("");

  const loadCedentes = useCallback(async () => {
    const j = await jfetch<{ rows: CedenteMini[] }>("/api/cedentes/mini");
    setCedentes(j.rows || []);
  }, []);

  const loadInventory = useCallback(async (cid: string) => {
    if (!cid) {
      setInventory(null);
      return;
    }
    const j = await jfetch<{ items: InvItem[] }>(`/api/cedentes/${encodeURIComponent(cid)}/program-inventory`);
    setInventory(j.items || []);
  }, []);

  const loadLedger = useCallback(async (cid: string, prog: Program) => {
    if (!cid) {
      setLedger([]);
      return;
    }
    const qs = new URLSearchParams({ program: prog, limit: "100" });
    const j = await jfetch<{ items: LedgerEntry[] }>(
      `/api/cedentes/${encodeURIComponent(cid)}/program-ledger?${qs}`
    );
    setLedger(j.items || []);
  }, []);

  useEffect(() => {
    loadCedentes().catch((e) => setErr(e instanceof Error ? e.message : "Erro ao listar cedentes"));
  }, [loadCedentes]);

  useEffect(() => {
    if (!cedenteId) {
      setInventory(null);
      setLedger([]);
      return;
    }
    setLoading(true);
    setErr(null);
    Promise.all([loadInventory(cedenteId), loadLedger(cedenteId, program)])
      .catch((e) => setErr(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [cedenteId, program, loadInventory, loadLedger]);

  const invRow = useMemo(() => (inventory || []).find((i) => i.program === program), [inventory, program]);

  async function postLedger(body: unknown) {
    if (!cedenteId) return;
    setErr(null);
    setMsg(null);
    try {
      await jfetch(`/api/cedentes/${encodeURIComponent(cedenteId)}/program-ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMsg("Registro gravado.");
      await loadInventory(cedenteId);
      await loadLedger(cedenteId, program);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao gravar");
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Clube • Extrato por programa</h1>
        <p className="text-sm text-neutral-500">
          Inventário e movimentações por programa. Compras e transferências atualizam o custo médio usado nas vendas sem
          compra vinculada.
        </p>
      </div>

      {(msg || err) && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            err ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {err || msg}
        </div>
      )}

      <div className="grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Cedente</label>
          <select
            className="h-10 rounded-xl border px-3 text-sm"
            value={cedenteId}
            onChange={(e) => setCedenteId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {cedentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nomeCompleto} • {c.identificador}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Programa</label>
          <select
            className="h-10 rounded-xl border px-3 text-sm"
            value={program}
            onChange={(e) => setProgram(e.target.value as Program)}
          >
            {PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {invRow ? (
        <div className="rounded-2xl border bg-white p-4 text-sm">
          <div className="mb-2 font-semibold">Saldo (referência)</div>
          <div className="grid gap-2 text-neutral-700 md:grid-cols-3">
            <div>
              <div className="text-xs text-neutral-500">Pontos no cedente (campo legado)</div>
              <div className="font-medium">{invRow.cedentePoints.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Inventário (pontos)</div>
              <div className="font-medium">{invRow.inventoryPoints.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">
                Milheiro médio {invRow.usesInventoryAvg ? "(inventário)" : "(fallback settings)"}
              </div>
              <div className="font-medium">{fmtMoney(invRow.avgMilheiroCents)}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-6 rounded-2xl border bg-white p-4">
        <div className="text-sm font-semibold">Lançamentos manuais</div>
        <p className="text-xs text-neutral-500">
          Cedente precisa estar aprovado. Valores em reais: formato brasileiro (ex.: 1.234,56).
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border p-3">
            <div className="text-xs font-semibold text-neutral-700">Compra de pontos</div>
            <input
              className="w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Pontos"
              value={purchasePts}
              onChange={(e) => setPurchasePts(e.target.value)}
            />
            <input
              className="w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Custo total (R$)"
              value={purchaseCost}
              onChange={(e) => setPurchaseCost(e.target.value)}
            />
            <input
              className="w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Bônus (pontos, opcional)"
              value={purchaseBonus}
              onChange={(e) => setPurchaseBonus(e.target.value)}
            />
            <input
              className="w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Nota (opcional)"
              value={purchaseNote}
              onChange={(e) => setPurchaseNote(e.target.value)}
            />
            <button
              type="button"
              className="rounded-xl bg-black px-3 py-2 text-xs text-white disabled:opacity-50"
              disabled={!cedenteId}
              onClick={() =>
                postLedger({
                  action: "PURCHASE",
                  program,
                  points: Math.max(0, Math.trunc(Number(purchasePts) || 0)),
                  totalCostCents: parseCentsReais(purchaseCost),
                  bonusPoints: Math.max(0, Math.trunc(Number(purchaseBonus) || 0)),
                  note: purchaseNote || null,
                })
              }
            >
              Registrar compra
            </button>
          </div>

          <div className="space-y-2 rounded-xl border p-3">
            <div className="text-xs font-semibold text-neutral-700">Bônus</div>
            <input
              className="w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Pontos de bônus"
              value={bonusPts}
              onChange={(e) => setBonusPts(e.target.value)}
            />
            <input
              className="w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Nota (opcional)"
              value={bonusNote}
              onChange={(e) => setBonusNote(e.target.value)}
            />
            <button
              type="button"
              className="rounded-xl bg-black px-3 py-2 text-xs text-white disabled:opacity-50"
              disabled={!cedenteId}
              onClick={() =>
                postLedger({
                  action: "BONUS",
                  program,
                  bonusPoints: Math.max(0, Math.trunc(Number(bonusPts) || 0)),
                  note: bonusNote || null,
                })
              }
            >
              Registrar bônus
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border p-3">
          <div className="text-xs font-semibold text-neutral-700">Transferência entre programas</div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border px-2 py-2 text-sm"
              value={xferFrom}
              onChange={(e) => setXferFrom(e.target.value as Program)}
            >
              {PROGRAMS.map((p) => (
                <option key={p} value={p}>
                  De: {p}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border px-2 py-2 text-sm"
              value={xferTo}
              onChange={(e) => setXferTo(e.target.value as Program)}
            >
              {PROGRAMS.map((p) => (
                <option key={p} value={p}>
                  Para: {p}
                </option>
              ))}
            </select>
          </div>
          <input
            className="w-full max-w-xs rounded-lg border px-2 py-2 text-sm"
            placeholder="Pontos"
            value={xferPts}
            onChange={(e) => setXferPts(e.target.value)}
          />
          <input
            className="w-full max-w-xs rounded-lg border px-2 py-2 text-sm"
            placeholder="Bônus (opcional)"
            value={xferBonus}
            onChange={(e) => setXferBonus(e.target.value)}
          />
          <input
            className="w-full max-w-md rounded-lg border px-2 py-2 text-sm"
            placeholder="Nota (opcional)"
            value={xferNote}
            onChange={(e) => setXferNote(e.target.value)}
          />
          <button
            type="button"
            className="rounded-xl bg-black px-3 py-2 text-xs text-white disabled:opacity-50"
            disabled={!cedenteId || xferFrom === xferTo}
            onClick={() =>
              postLedger({
                action: "TRANSFER",
                fromProgram: xferFrom,
                toProgram: xferTo,
                points: Math.max(0, Math.trunc(Number(xferPts) || 0)),
                bonusPoints: Math.max(0, Math.trunc(Number(xferBonus) || 0)),
                note: xferNote || null,
              })
            }
          >
            Registrar transferência
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Extrato {program}</span>
          {loading ? <span className="text-xs text-neutral-500">Carregando…</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Δ pontos</th>
                <th className="px-3 py-2 text-right">Δ custo</th>
                <th className="px-3 py-2 text-right">Bônus</th>
                <th className="px-3 py-2">Par</th>
                <th className="px-3 py-2">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ledger.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(e.occurredAt)}</td>
                  <td className="px-3 py-2">{kindPt(e.kind)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.pointsDelta.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(e.costDeltaCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.bonusPoints.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2">{e.peerProgram || "—"}</td>
                  <td className="max-w-[240px] truncate px-3 py-2" title={e.note || ""}>
                    {e.note || "—"}
                  </td>
                </tr>
              ))}
              {!ledger.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                    {cedenteId ? "Nenhum lançamento." : "Selecione um cedente."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
