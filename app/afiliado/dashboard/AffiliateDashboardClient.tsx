"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SaleRow = {
  id: string;
  numero: string;
  date: string;
  program: string;
  clientName: string;
  clientIdentifier: string;
  points: number;
  passengers: number;
  totalCents: number;
  pointsValueCents: number;
  costCents: number;
  profitBrutoCents: number;
  bonusCents: number;
  profitCents: number;
  affiliateCommissionCents: number;
  paymentStatus: string;
  locator: string | null;
};

type DashboardData = {
  affiliate: {
    id: string;
    name: string;
    login: string | null;
    document: string;
    flightSalesLink: string | null;
    pointsPurchaseLink: string | null;
    commissionBps: number;
  };
  metrics: {
    clientsCount: number;
    salesCount: number;
    totalSalesCents: number;
    totalProfitCents: number;
    totalCommissionCents: number;
    commissionBps: number;
    sales: SaleRow[];
  };
};

function fmtMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtPercent(bps: number) {
  return `${(Number(bps || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function statusLabel(value: string) {
  if (value === "PAID") return "Pago";
  if (value === "CANCELED") return "Cancelado";
  return "Pendente";
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function AffiliateDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/afiliado/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao carregar painel.");
      setData(json.data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro ao carregar painel.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/afiliado/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => null);
    router.replace("/afiliado/login");
    router.refresh();
  }

  useEffect(() => {
    load();
  }, []);

  const sales = data?.metrics.sales || [];
  const lastUpdate = new Date().toLocaleString("pt-BR");

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl rounded-2xl border bg-white p-6 text-sm text-slate-600">
          Carregando painel do afiliado...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl rounded-2xl border bg-white p-6">
          <div className="text-sm text-rose-600">{error || "Painel indisponível."}</div>
          <button
            type="button"
            onClick={logout}
            className="mt-4 rounded-xl bg-black px-4 py-2 text-sm text-white"
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-300/70 bg-slate-950 text-xs font-bold text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.55)]">
              LF
            </div>
            <div>
              <h1 className="text-xl font-semibold text-cyan-300 [text-shadow:0_0_8px_rgba(34,211,238,0.65)]">
                LF Vianges - Trademiles
              </h1>
              <p className="text-sm text-slate-600">
                {data.affiliate.name} · comissão {fmtPercent(data.affiliate.commissionBps)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Sair
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          <Kpi label="Clientes indicados" value={String(data.metrics.clientsCount)} />
          <Kpi label="Vendas dos indicados" value={String(data.metrics.salesCount)} />
          <Kpi label="Valor total vendido" value={fmtMoney(data.metrics.totalSalesCents)} />
          <Kpi label="Lucro total" value={fmtMoney(data.metrics.totalProfitCents)} />
          <Kpi
            label="Sua comissão"
            value={fmtMoney(data.metrics.totalCommissionCents)}
            hint={`${fmtPercent(data.metrics.commissionBps)} sobre lucro positivo`}
          />
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-xs text-slate-500">Link para indicação de passagens</div>
            <a
              href={data.affiliate.flightSalesLink || "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-sm font-medium text-sky-700"
            >
              {data.affiliate.flightSalesLink || "Não cadastrado"}
            </a>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-xs text-slate-500">Link para indicação de compra de pontos</div>
            <a
              href={data.affiliate.pointsPurchaseLink || "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-sm font-medium text-sky-700"
            >
              {data.affiliate.pointsPurchaseLink || "Não cadastrado"}
            </a>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Vendas dos seus indicados</h2>
              <p className="text-xs text-slate-500">
                Atualizado em {lastUpdate}. Valores de lucro são estimados pela venda sem taxa menos custo dos pontos e bônus.
              </p>
            </div>
            <div className="text-xs text-slate-500">Até 500 vendas mais recentes</div>
          </div>

          {sales.length === 0 ? (
            <div className="rounded-xl border p-4 text-sm text-slate-600">
              Ainda não há vendas para clientes indicados por você.
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Venda</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Programa</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Lucro</th>
                    <th className="px-3 py-2 text-right">Comissão</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">{fmtDate(sale.date)}</td>
                      <td className="px-3 py-2 font-medium">{sale.numero}</td>
                      <td className="px-3 py-2">
                        <div>{sale.clientName}</div>
                        <div className="text-xs text-slate-500">{sale.clientIdentifier}</div>
                      </td>
                      <td className="px-3 py-2">{sale.program}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(sale.totalCents)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(sale.profitCents)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                        {fmtMoney(sale.affiliateCommissionCents)}
                      </td>
                      <td className="px-3 py-2">{statusLabel(sale.paymentStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
