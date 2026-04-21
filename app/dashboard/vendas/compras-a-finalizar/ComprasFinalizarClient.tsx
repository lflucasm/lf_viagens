"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Row = {
  purchaseId: string;
  numero: string;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string } | null;

  purchaseTotalCents: number;

  /** ✅ total cobrado (pode ter taxa) */
  salesTotalCents: number;

  /** ✅ valor das milhas (SEM taxa) */
  salesPointsValueCents?: number;

  /** ✅ soma das taxas (diferença) */
  salesTaxesCents?: number;

  /** ✅ saldo/lucro (SEM taxa) — BRUTO (antes do bônus) */
  saldoCents: number;

  pax: number;
  soldPoints: number;

  /** ✅ milheiro médio SEM taxa */
  avgMilheiroCents: number | null;

  pointsTotal?: number; // pontosCiaTotal
  remainingPoints?: number;
  metaMilheiroCents?: number;

  projectedProfitAvgCents?: number | null;
  projectedProfitMetaCents?: number | null;

  salesCount: number;
  lastSaleAt: string | null;

  sales: Array<{
    id: string;
    numero: string;
    date: string;
    program: string;
    points: number;
    passengers: number;

    /** ✅ total cobrado (com taxa) */
    totalCents: number;

    /** ✅ valor das milhas (SEM taxa) */
    pointsValueCents?: number;

    locator: string | null;
    paymentStatus: string;
  }>;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function fmtDateBR(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

function n(v: any, fb = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : fb;
}
function nOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : null;
}

/**
 * ✅ Milheiro SEM taxa.
 * Usa pointsValueCents (milhas) quando disponível; senão, cai no total (para compatibilidade).
 */
function milheiroFromSale(
  points: number,
  pointsValueCents?: number,
  totalCentsFallback?: number
): number | null {
  const pts = Number(points || 0);
  const cents =
    Number(pointsValueCents ?? 0) > 0
      ? Number(pointsValueCents || 0)
      : Number(totalCentsFallback || 0);

  if (!Number.isFinite(pts) || !Number.isFinite(cents) || pts <= 0 || cents <= 0) return null;
  return Math.round((cents * 1000) / pts); // centavos por 1000 pontos
}

/**
 * ✅ Bônus = 30% do excedente acima da meta (apenas sobre valor das milhas, SEM taxa).
 */
function bonus30FromSale(points: number, milheiroCents: number | null, metaMilheiroCents: number): number {
  const pts = Number(points || 0);
  const mil = Number(milheiroCents || 0);
  const meta = Number(metaMilheiroCents || 0);
  if (!pts || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

function computeRow(r: Row) {
  // ✅ base SEM taxa (preferencial)
  const salesPointsValueCents = n(
    (r as any).salesPointsValueCents,
    // fallback: se backend antigo, cai no salesTotalCents
    n((r as any).salesTotalCents, 0)
  );

  const salesTotalCents = n((r as any).salesTotalCents, 0);
  const salesTaxesCents =
    typeof (r as any).salesTaxesCents === "number"
      ? n((r as any).salesTaxesCents, 0)
      : Math.max(salesTotalCents - salesPointsValueCents, 0);

  const pointsTotal = n((r as any).pointsTotal, n((r as any).pontosCiaTotal, 0));
  const remainingPoints =
    typeof (r as any).remainingPoints === "number"
      ? n((r as any).remainingPoints, 0)
      : pointsTotal > 0
      ? Math.max(pointsTotal - n(r.soldPoints, 0), 0)
      : null;

  const avgMilheiroCents = nOrNull((r as any).avgMilheiroCents);
  const metaMilheiroCentsRaw = n((r as any).metaMilheiroCents, 0);

  const saldoBrutoCents = n((r as any).saldoCents, salesPointsValueCents - (r.purchaseTotalCents || 0));

  const bonusPaidCents = (r.sales || []).reduce((acc, s) => {
    const pv = n((s as any).pointsValueCents, 0);
    const mil = milheiroFromSale(s.points, pv > 0 ? pv : undefined, s.totalCents);
    return acc + bonus30FromSale(s.points, mil, metaMilheiroCentsRaw);
  }, 0);

  const netSaldoCents = saldoBrutoCents - bonusPaidCents;

  const projectedProfitAvgCentsBackend = (
    "projectedProfitAvgCents" in r ? (r.projectedProfitAvgCents ?? null) : null
  ) as number | null;

  const projectedProfitMetaCentsBackend = (
    "projectedProfitMetaCents" in r ? (r.projectedProfitMetaCents ?? null) : null
  ) as number | null;

  const calcProjectedAvgBruto =
    projectedProfitAvgCentsBackend !== null
      ? projectedProfitAvgCentsBackend
      : remainingPoints != null && avgMilheiroCents != null && avgMilheiroCents > 0
      ? salesPointsValueCents + Math.round((remainingPoints * avgMilheiroCents) / 1000) - (r.purchaseTotalCents || 0)
      : null;

  const calcProjectedMetaBruto =
    projectedProfitMetaCentsBackend !== null
      ? projectedProfitMetaCentsBackend
      : remainingPoints != null && metaMilheiroCentsRaw > 0
      ? salesPointsValueCents + Math.round((remainingPoints * metaMilheiroCentsRaw) / 1000) - (r.purchaseTotalCents || 0)
      : null;

  const futureBonusAvg =
    remainingPoints != null && avgMilheiroCents != null && avgMilheiroCents > 0
      ? bonus30FromSale(remainingPoints, avgMilheiroCents, metaMilheiroCentsRaw)
      : 0;

  const futureBonusMeta = 0;

  const projectedNetAvg =
    calcProjectedAvgBruto == null ? null : calcProjectedAvgBruto - bonusPaidCents - futureBonusAvg;
  const projectedNetMeta =
    calcProjectedMetaBruto == null ? null : calcProjectedMetaBruto - bonusPaidCents - futureBonusMeta;

  return {
    salesTotalCents,
    salesPointsValueCents,
    salesTaxesCents,

    remainingPoints,
    pointsTotal: pointsTotal || null,

    avgMilheiroCents,
    metaMilheiroCents: metaMilheiroCentsRaw || null,

    saldoBrutoCents,
    bonusPaidCents,
    netSaldoCents,

    projectedProfitAvgCents: projectedNetAvg,
    projectedProfitMetaCents: projectedNetMeta,
  };
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
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data as T;
}

export default function ComprasFinalizarClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());

      const out = await api<{ ok: true; rows: Row[]; needsMigration?: boolean }>(
        `/api/vendas/compras-a-finalizar?${qs.toString()}`
      );

      setRows(Array.isArray(out.rows) ? out.rows : []);
      setNeedsMigration(Boolean(out.needsMigration));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
      setRows([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = [
        r.numero,
        r.purchaseId,
        r.cedente?.nomeCompleto || "",
        r.cedente?.cpf || "",
        r.cedente?.identificador || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    let compras = 0;

    let vendasTotal = 0; // com taxa
    let vendasMilhas = 0; // sem taxa

    let saldoLiquido = 0; // lucro sem taxa - bônus
    let bonusPago = 0;

    for (const r of filtered) {
      const c = computeRow(r);

      compras += r.purchaseTotalCents || 0;
      vendasTotal += c.salesTotalCents || 0;
      vendasMilhas += c.salesPointsValueCents || 0;

      bonusPago += c.bonusPaidCents || 0;
      saldoLiquido += c.netSaldoCents || 0;
    }

    return { ids: filtered.length, compras, vendasTotal, vendasMilhas, saldoLiquido, bonusPago };
  }, [filtered]);

  async function onFinalizar(purchaseId: string) {
    const ok = window.confirm("Finalizar esta compra? Isso grava os totais e trava como finalizada.");
    if (!ok) return;

    setBusyId(purchaseId);
    setErr(null);

    try {
      await api<{ ok: true }>(`/api/vendas/compras-finalizar`, {
        method: "PATCH",
        body: JSON.stringify({ purchaseId }),
      });

      await load({ silent: true });
      alert("Compra finalizada.");
    } catch (e: any) {
      setErr(e?.message || "Falha ao finalizar.");
    } finally {
      setBusyId(null);
    }
  }

  async function onCancelarSemImpacto(purchaseId: string) {
    const ok = window.confirm(
      "Cancelar sem impacto? Isso só ARQUIVA este ID e ele não aparecerá mais para efetuar venda."
    );
    if (!ok) return;

    setBusyId(purchaseId);
    setErr(null);

    try {
      await api<{ ok: true }>(`/api/vendas/compras-a-finalizar/${purchaseId}/cancelar`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      await load({ silent: true });
      alert("Compra arquivada (sem impacto).");
    } catch (e: any) {
      setErr(e?.message || "Falha ao cancelar sem impacto.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Compras a finalizar</h1>
          <p className="text-sm text-gray-600">
            Agrupa por ID (compra LIBERADA). Mostra valores SEM taxa. O saldo aqui é <b>líquido</b> (desconta bônus 30%
            do excedente).
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {needsMigration && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Parece que as colunas de finalização ainda não foram migradas no banco (finalizedAt/final*). Rode uma
          migration pra isso.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">IDs no filtro</div>
          <div className="mt-1 text-xl font-semibold">{fmtInt(totals.ids)}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Soma compras</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.compras)}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Soma vendas (milhas)</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.vendasMilhas)}</div>
          <div className="mt-1 text-xs text-gray-500">Total cobrado: {fmtMoneyBR(totals.vendasTotal)}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Saldo líquido (sem taxa)</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.saldoLiquido)}</div>
          <div className="mt-1 text-xs text-gray-500">Bônus pago: {fmtMoneyBR(totals.bonusPago)}</div>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Buscar por cedente / ID..."
        />
      </div>

      {err && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="overflow-auto rounded-xl border">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">#</th>
              <th className="p-3">Cedente</th>
              <th className="p-3">ID</th>
              <th className="p-3">Pax (ID)</th>

              {/* ✅ NOVO: pontos restantes */}
              <th className="p-3">Restante (pts)</th>

              <th className="p-3">Saldo</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="p-4 text-gray-500">
                  Nenhum resultado.
                </td>
              </tr>
            )}

            {filtered.map((r, idx) => {
              const isOpen = Boolean(open[r.purchaseId]);
              const isBusy = busyId === r.purchaseId;

              const c = computeRow(r);

              return (
                <Fragment key={r.purchaseId}>
                  <tr className="border-t">
                    <td className="p-3">{idx + 1}</td>

                    <td className="p-3">
                      {r.cedente ? (
                        <div className="space-y-0.5">
                          <div className="font-medium">{r.cedente.nomeCompleto}</div>
                          <div className="text-xs text-gray-500">
                            CPF {r.cedente.cpf} · {r.cedente.identificador}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="font-mono">{r.numero}</div>
                      <div className="text-xs text-gray-500">{r.purchaseId}</div>
                    </td>

                    <td className="p-3">
                      <div className="font-medium">{fmtInt(r.pax)}</div>
                      <div className="text-xs text-gray-500">{fmtInt(r.salesCount)} venda(s)</div>
                    </td>

                    {/* ✅ NOVO */}
                    <td className="p-3">
                      <div className="font-medium">
                        {c.remainingPoints == null ? "—" : `${fmtInt(c.remainingPoints)} pts`}
                      </div>
                      <div className="text-xs text-gray-500">a vender</div>
                    </td>

                    <td className="p-3 font-medium">{fmtMoneyBR(c.netSaldoCents)}</td>

                    <td className="p-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setOpen((m) => ({ ...m, [r.purchaseId]: !isOpen }))}
                          className="rounded-md border px-2 py-1 text-xs"
                        >
                          {isOpen ? "Fechar" : "Ver"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void onFinalizar(r.purchaseId)}
                          disabled={isBusy}
                          className="rounded-md bg-black px-2 py-1 text-xs text-white disabled:opacity-50"
                          title="Finaliza e grava os totais"
                        >
                          {isBusy ? "..." : "Finalizar"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void onCancelarSemImpacto(r.purchaseId)}
                          disabled={isBusy}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                          title="Arquiva este ID sem impacto (não altera saldo, nem itens)"
                        >
                          {isBusy ? "..." : "Cancelar"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-t bg-slate-50">
                      <td colSpan={7} className="p-3">
                        <div className="text-xs text-gray-700 mb-2 flex flex-wrap gap-x-3 gap-y-1">
                          <span>
                            Compras: <b>{fmtMoneyBR(r.purchaseTotalCents)}</b>
                          </span>

                          <span title="Somente valor das milhas (SEM taxa de embarque)">
                            Vendas (milhas): <b>{fmtMoneyBR(c.salesPointsValueCents)}</b>
                          </span>

                          <span title="Taxas de embarque (diferença entre total cobrado e milhas)">
                            Taxas: <b>{fmtMoneyBR(c.salesTaxesCents)}</b>
                          </span>

                          <span title="Total cobrado do cliente (inclui taxas)">
                            Total cobrado: <b>{fmtMoneyBR(c.salesTotalCents)}</b>
                          </span>

                          <span title="Meta do milheiro (da compra)">
                            Meta milheiro: <b>{c.metaMilheiroCents == null ? "—" : fmtMoneyBR(c.metaMilheiroCents)}</b>
                          </span>

                          <span title="Milheiro médio SEM taxa">
                            Milheiro médio: <b>{c.avgMilheiroCents == null ? "—" : fmtMoneyBR(c.avgMilheiroCents)}</b>
                          </span>

                          <span title="Bônus pago (30% do excedente acima da meta)">
                            Bônus pago: <b>{fmtMoneyBR(c.bonusPaidCents)}</b>
                          </span>

                          <span title="Saldo BRUTO (sem taxa), antes do bônus">
                            Saldo bruto: <b>{fmtMoneyBR(c.saldoBrutoCents)}</b>
                          </span>

                          <span title="Saldo LÍQUIDO (sem taxa), já descontando bônus">
                            Saldo líquido: <b>{fmtMoneyBR(c.netSaldoCents)}</b>
                          </span>

                          <span title="Lucro previsto LÍQUIDO (desconta bônus já pago e bônus futuro estimado)">
                            Lucro previsto (média):{" "}
                            <b>{c.projectedProfitAvgCents == null ? "—" : fmtMoneyBR(c.projectedProfitAvgCents)}</b>
                          </span>

                          <span title="Lucro previsto LÍQUIDO (na meta não tem bônus futuro)">
                            Lucro previsto (meta):{" "}
                            <b>{c.projectedProfitMetaCents == null ? "—" : fmtMoneyBR(c.projectedProfitMetaCents)}</b>
                          </span>

                          <span>
                            Restante: <b>{c.remainingPoints == null ? "—" : fmtInt(c.remainingPoints)} pts</b>
                          </span>

                          <span>
                            Última venda: <b>{r.lastSaleAt ? fmtDateBR(r.lastSaleAt) : "—"}</b>
                          </span>
                        </div>

                        <div className="overflow-auto rounded-lg border bg-white">
                          <table className="min-w-[1300px] w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr className="text-left">
                                <th className="p-2">Venda</th>
                                <th className="p-2">Data</th>
                                <th className="p-2">Programa</th>
                                <th className="p-2">Pts</th>
                                <th className="p-2">Pax</th>

                                <th className="p-2">Valor (c/ taxa)</th>
                                <th className="p-2">Milhas (s/ taxa)</th>
                                <th className="p-2">Milheiro (s/ taxa)</th>
                                <th className="p-2">Bônus (30%)</th>

                                <th className="p-2">Locator</th>
                                <th className="p-2">Status</th>
                              </tr>
                            </thead>

                            <tbody>
                              {r.sales.length === 0 ? (
                                <tr>
                                  <td colSpan={11} className="p-3 text-gray-500">
                                    Sem vendas vinculadas a este ID.
                                  </td>
                                </tr>
                              ) : (
                                r.sales.map((s) => {
                                  const pv = n((s as any).pointsValueCents, 0);
                                  const mil = milheiroFromSale(s.points, pv > 0 ? pv : undefined, s.totalCents);

                                  const meta = n((r as any).metaMilheiroCents, 0);
                                  const bonus = bonus30FromSale(s.points, mil, meta);

                                  return (
                                    <tr key={s.id} className="border-t">
                                      <td className="p-2 font-mono">{s.numero}</td>
                                      <td className="p-2">{fmtDateBR(s.date)}</td>
                                      <td className="p-2">{s.program}</td>
                                      <td className="p-2">{fmtInt(s.points)}</td>
                                      <td className="p-2">{fmtInt(s.passengers)}</td>

                                      <td className="p-2 font-medium">{fmtMoneyBR(s.totalCents)}</td>
                                      <td className="p-2">{pv > 0 ? fmtMoneyBR(pv) : "—"}</td>
                                      <td className="p-2">{mil == null ? "—" : fmtMoneyBR(mil)}</td>
                                      <td className="p-2">{bonus > 0 ? fmtMoneyBR(bonus) : "—"}</td>

                                      <td className="p-2">{s.locator || "—"}</td>
                                      <td className="p-2">{s.paymentStatus}</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {loading && (
              <tr>
                <td colSpan={7} className="p-4 text-gray-500">
                  Carregando...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
