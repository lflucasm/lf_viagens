"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Trip = {
  kind: "sale";
  id: string;
  numero: string;
  locator: string;
  program: string;
  points: number;
  passengers: number;
  milheiroCents: number;
  totalCents: number;
  departureDate: string | null;
  returnDate: string | null;
  departureAirportIata: string | null;
  firstPassengerLastName: string | null;
  cliente: { id: string; nome: string; identificador: string };
  cedente: { id: string; nomeCompleto: string; identificador: string };
};

function fmtDateBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Recife", dateStyle: "short", timeStyle: "short" });
}

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function recifeTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

export default function ViagensAgendaClient() {
  const [from, setFrom] = useState(() => recifeTodayISO());
  const [days, setDays] = useState(60);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Trip | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ from, days: String(days) });
      const r = await fetch(`/api/agenda-viagens?${qs}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Erro ao carregar");
      setTrips(j.trips || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro");
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [from, days]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of trips) {
      if (!t.departureDate) continue;
      const d = new Date(t.departureDate);
      const key = d.toLocaleDateString("en-CA", { timeZone: "America/Recife" });
      const arr = m.get(key) || [];
      arr.push(t);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [trips]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda de viagens</h1>
          <p className="text-sm text-slate-600">
            Vendas com <b>localizador</b> e <b>data de embarque</b>. Toque na linha para ver cliente e detalhes do voo.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-slate-500">A partir de</label>
            <input
              type="date"
              className="rounded-xl border px-3 py-2 text-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value.slice(0, 10))}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500">Dias à frente</label>
            <input
              type="number"
              min={1}
              max={120}
              className="w-24 rounded-xl border px-3 py-2 text-sm"
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(120, Number(e.target.value) || 60)))}
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white"
            disabled={loading}
          >
            {loading ? "…" : "Atualizar"}
          </button>
          <Link href="/dashboard" className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50">
            Início
          </Link>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div> : null}

      {loading ? <p className="text-sm text-slate-500">Carregando voos…</p> : null}

      {!loading && !byDay.length ? (
        <p className="text-sm text-slate-600">Nenhum voo encontrado no período (confira localizador e data de embarque nas vendas).</p>
      ) : null}

      <div className="space-y-6">
        {byDay.map(([dayKey, rows]) => (
          <div key={dayKey} className="rounded-2xl border bg-white overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
              {new Date(dayKey + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
                timeZone: "America/Recife",
              })}
            </div>
            <div className="divide-y">
              {rows.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOpen(t)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <div className="font-mono font-semibold text-sky-800">{t.locator}</div>
                    <div className="text-xs text-slate-500">
                      {t.program} • Venda {t.numero} • {t.cliente.nome}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>{fmtDateBR(t.departureDate)}</div>
                    {t.departureAirportIata ? <div>IATA {t.departureAirportIata}</div> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fechar" onClick={() => setOpen(null)} />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-white p-4 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">Localizador {open.locator}</div>
                <div className="text-xs text-slate-500">Venda {open.numero}</div>
              </div>
              <button
                type="button"
                className="rounded-lg border px-2 py-1 text-xs"
                onClick={() => setOpen(null)}
              >
                Fechar
              </button>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">Cliente</dt>
                <dd>
                  {open.cliente.nome} <span className="text-slate-500">({open.cliente.identificador})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Cedente</dt>
                <dd>
                  {open.cedente.nomeCompleto}{" "}
                  <span className="text-slate-500">({open.cedente.identificador})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Programa / pontos</dt>
                <dd>
                  {open.program} • {open.points.toLocaleString("pt-BR")} pts • {open.passengers} pax
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Milheiro / total</dt>
                <dd>
                  {fmtMoney(open.milheiroCents)} • {fmtMoney(open.totalCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Embarque</dt>
                <dd>{fmtDateBR(open.departureDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Retorno</dt>
                <dd>{fmtDateBR(open.returnDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Aeroporto / passageiro</dt>
                <dd>
                  {open.departureAirportIata || "—"} • {open.firstPassengerLastName || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
