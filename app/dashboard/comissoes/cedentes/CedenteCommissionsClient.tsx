"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "PENDING" | "PAID" | "CANCELED" | "";

type CommissionItem = {
  id: string;
  cedenteId: string;
  purchaseId: string | null;
  amountCents: number;
  status: "PENDING" | "PAID" | "CANCELED";
  generatedAt: string;
  paidAt: string | null;
  note: string | null;

  cedente?: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;

  purchase?: {
    id: string;
    numero: string;
    status: string;
    totalCents?: number | null;
  } | null;

  generatedBy?: { id: string; name: string; login: string } | null;
  paidBy?: { id: string; name: string; login: string } | null;
};

type ListResp = {
  total: number;
  take: number;
  skip: number;
  items: CommissionItem[];
  topWindowDays?: number;
  topRecebedores?: TopRecebedor[];
};

type TopRecebedor = {
  cedenteId: string | null;
  totalCents: number;
  count: number;
  cedente?: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function statusBadge(status: CommissionItem["status"]) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  if (status === "PENDING")
    return <span className={`${base} border-amber-200 bg-amber-50 text-amber-700`}>Pendente</span>;
  if (status === "PAID")
    return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>Paga</span>;
  return <span className={`${base} border-neutral-200 bg-neutral-50 text-neutral-700`}>Cancelada</span>;
}

function clampInt(v: any, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function CedenteCommissionsClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  // filtros
  const [status, setStatus] = useState<Status>("PENDING");
  const [from, setFrom] = useState<string>(""); // YYYY-MM-DD
  const [to, setTo] = useState<string>(""); // YYYY-MM-DD
  const [q, setQ] = useState<string>(""); // filtro local (nome/cpf/ID/numero)
  const [take, setTake] = useState<number>(50);
  const [skip, setSkip] = useState<number>(0);
  const [topWindowDays, setTopWindowDays] = useState<number>(30);

  const [data, setData] = useState<ListResp>({
    total: 0,
    take: 50,
    skip: 0,
    items: [],
  });

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("topWindowDays", String(topWindowDays));
      params.set("take", String(clampInt(take, 1, 200)));
      params.set("skip", String(clampInt(skip, 0, 1_000_000)));

      const res = await fetch(`/api/cedente-commissions?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.message || "Falha ao carregar.");
        return;
      }

      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to, take, skip, topWindowDays]);

  const filteredItems = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return data.items;

    return data.items.filter((it) => {
      const ced = it.cedente;
      const p = it.purchase;
      const hay = [
        it.id,
        ced?.nomeCompleto,
        ced?.cpf,
        ced?.identificador,
        p?.numero,
        it.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [data.items, q]);

  const pageSum = useMemo(() => {
    return filteredItems.reduce((acc, it) => acc + (it.amountCents || 0), 0);
  }, [filteredItems]);

  const topRecebedores = data.topRecebedores || [];

  const totalPages = useMemo(() => {
    const t = data?.total || 0;
    const tk = data?.take || take || 50;
    return Math.max(1, Math.ceil(t / tk));
  }, [data.total, data.take, take]);

  const currentPage = useMemo(() => {
    const tk = data?.take || take || 50;
    return Math.floor((data?.skip || 0) / tk) + 1;
  }, [data.skip, data.take, take]);

  async function payCommission(id: string) {
    const note = window.prompt("Observação (opcional):", "") ?? "";
    const okConfirm = window.confirm("Confirmar: marcar esta comissão como PAGA?");
    if (!okConfirm) return;

    try {
      setLoading(true);
      setErr("");

      const res = await fetch(`/api/cedente-commissions/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.message || "Falha ao pagar comissão.");
        return;
      }

      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado ao pagar.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelCommission(id: string) {
    const note = window.prompt("Motivo/observação (opcional):", "") ?? "";
    const okConfirm = window.confirm("Confirmar: cancelar esta comissão?");
    if (!okConfirm) return;

    try {
      setLoading(true);
      setErr("");

      const res = await fetch(`/api/cedente-commissions/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.message || "Falha ao cancelar comissão.");
        return;
      }

      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado ao cancelar.");
    } finally {
      setLoading(false);
    }
  }

  function resetPaging() {
    setSkip(0);
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-neutral-600">Status</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Status);
                resetPaging();
              }}
            >
              <option value="PENDING">Pendente</option>
              <option value="PAID">Paga</option>
              <option value="CANCELED">Cancelada</option>
              <option value="">Todos</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-medium text-neutral-600">De</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                resetPaging();
              }}
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-medium text-neutral-600">Até</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                resetPaging();
              }}
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-medium text-neutral-600">Buscar (local)</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Nome, CPF, ID, Nº compra..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-neutral-600">Por página</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={take}
              onChange={(e) => {
                setTake(Number(e.target.value));
                resetPaging();
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          <div className="md:col-span-10 flex gap-2">
            <button
              className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-neutral-50"
              onClick={() => {
                setStatus("PENDING");
                setFrom("");
                setTo("");
                setQ("");
                setTake(50);
                setSkip(0);
              }}
              disabled={loading}
            >
              Limpar
            </button>

            <button
              className="rounded-xl bg-black px-3 py-2 text-sm text-white hover:opacity-90"
              onClick={() => load()}
              disabled={loading}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-neutral-600">
            Total no filtro (backend): <span className="font-medium text-neutral-900">{data.total}</span>
          </div>
          <div className="text-neutral-600">
            Soma desta lista (página/filtrada): <span className="font-medium text-neutral-900">{fmtMoneyBR(pageSum)}</span>
          </div>
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        ) : null}
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr className="text-left">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cedente</th>
                <th className="px-4 py-3">Compra</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Gerada em</th>
                <th className="px-4 py-3">Paga em</th>
                <th className="px-4 py-3">Obs.</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={8}>
                    Carregando...
                  </td>
                </tr>
              ) : null}

              {!loading && filteredItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={8}>
                    Nenhuma comissão encontrada.
                  </td>
                </tr>
              ) : null}

              {filteredItems.map((it) => (
                <tr key={it.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">{statusBadge(it.status)}</td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">
                      {it.cedente?.nomeCompleto || "—"}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {it.cedente?.identificador ? `ID: ${it.cedente.identificador} · ` : ""}
                      {it.cedente?.cpf ? `CPF: ${it.cedente.cpf}` : ""}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">
                      {it.purchase?.numero || "—"}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {it.purchase?.status ? `Status: ${it.purchase.status}` : ""}
                    </div>
                  </td>

                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {fmtMoneyBR(it.amountCents)}
                  </td>

                  <td className="px-4 py-3 text-neutral-700">
                    {fmtDateTimeBR(it.generatedAt)}
                  </td>

                  <td className="px-4 py-3 text-neutral-700">
                    {fmtDateTimeBR(it.paidAt)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="max-w-[280px] truncate text-neutral-700" title={it.note || ""}>
                      {it.note || "—"}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="rounded-xl border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
                        onClick={() => payCommission(it.id)}
                        disabled={loading || it.status !== "PENDING"}
                        title={it.status !== "PENDING" ? "Somente PENDING pode ser paga" : "Marcar como PAGA"}
                      >
                        Pagar
                      </button>

                      <button
                        className="rounded-xl border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
                        onClick={() => cancelCommission(it.id)}
                        disabled={loading || it.status !== "PENDING"}
                        title={it.status !== "PENDING" ? "Somente PENDING pode ser cancelada" : "Cancelar"}
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm">
          <div className="text-neutral-600">
            Página <span className="font-medium text-neutral-900">{currentPage}</span> de{" "}
            <span className="font-medium text-neutral-900">{totalPages}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-40"
              disabled={loading || skip <= 0}
              onClick={() => setSkip(Math.max(0, skip - take))}
            >
              Anterior
            </button>
            <button
              className="rounded-xl border px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-40"
              disabled={loading || skip + take >= (data.total || 0)}
              onClick={() => setSkip(skip + take)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Quem mais recebeu dinheiro
            </h2>
            <p className="text-sm text-neutral-500">
              Lista de comissoes pagas por cedente no periodo selecionado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[30, 60, 90, 180, 365].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setTopWindowDays(days)}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm transition",
                  topWindowDays === days
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50",
                ].join(" ")}
              >
                {days === 365 ? "1 ano" : `${days} dias`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-neutral-50 text-neutral-600">
              <tr className="text-left">
                <th className="px-4 py-3">Cedente</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Qtd. pagas</th>
                <th className="px-4 py-3">Total recebido</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topRecebedores.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={5}>
                    Nenhuma comissao paga neste periodo.
                  </td>
                </tr>
              ) : (
                topRecebedores.map((item) => (
                  <tr key={item.cedenteId || `sem-cedente-${item.totalCents}`} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {item.cedente?.nomeCompleto || "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {item.cedente?.identificador || "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {item.cedente?.cpf || "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{item.count}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {fmtMoneyBR(item.totalCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
