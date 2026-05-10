"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  LayoutDashboard,
  Loader2,
  Phone,
  Plane,
  ShoppingCart,
  Store,
  Users,
  UsersRound,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/dashboard";
import LogoutButton from "@/components/LogoutButton";
import { ShortcutCard } from "@/components/ui/dashboard-cards";

type ViagemHoje = {
  id: string;
  locator: string;
  departureDate: string | null;
  program: string;
  cliente: { nome: string; identificador: string };
};

type PresenceMember = {
  id: string;
  name: string;
  login: string;
  updatedAt: string;
  isOnline: boolean;
};

function todayISORecife(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

export default function DashboardHomeClient({
  session,
}: {
  session: { id: string; login: string; name?: string; team: string; role: string };
}) {
  const [viagensLoading, setViagensLoading] = useState(true);
  const [viagensError, setViagensError] = useState<string | null>(null);
  const [viagensHoje, setViagensHoje] = useState<ViagemHoje[]>([]);

  const [presenceLoading, setPresenceLoading] = useState(true);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [members, setMembers] = useState<PresenceMember[]>([]);

  const [brandLoading, setBrandLoading] = useState(true);
  const [brand, setBrand] = useState<{
    companyDisplayName: string;
    companyLegalName: string;
    cnpj: string;
    instagramHandle: string;
    phoneDisplay: string;
    whatsappDigits: string;
  } | null>(null);

  const todayISO = useMemo(() => todayISORecife(), []);
  const loadViagensHoje = useCallback(async () => {
    setViagensLoading(true);
    setViagensError(null);
    try {
      const qs = new URLSearchParams({ from: todayISO, days: "1" });
      const res = await fetch(`/api/agenda-viagens?${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) throw new Error(json?.error || "Erro ao carregar viagens.");
      const trips = (json.trips || []) as ViagemHoje[];
      setViagensHoje(trips);
    } catch (e) {
      setViagensError(e instanceof Error ? e.message : "Erro ao carregar viagens.");
      setViagensHoje([]);
    } finally {
      setViagensLoading(false);
    }
  }, [todayISO]);

  const loadPresence = useCallback(async () => {
    setPresenceLoading(true);
    setPresenceError(null);
    try {
      const res = await fetch("/api/team/presence", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao carregar equipe.");
      setMembers(json.members || []);
    } catch (e) {
      setPresenceError(e instanceof Error ? e.message : "Erro ao carregar equipe.");
      setMembers([]);
    } finally {
      setPresenceLoading(false);
    }
  }, []);

  const ping = useCallback(async () => {
    try {
      await fetch("/api/me/ping", { method: "POST" });
    } catch {
      /* ignore */
    }
  }, []);

  const loadBrand = useCallback(async () => {
    setBrandLoading(true);
    try {
      const res = await fetch("/api/app-settings/public", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.ok && json.data) {
        setBrand({
          companyDisplayName: String(json.data.companyDisplayName || ""),
          companyLegalName: String(json.data.companyLegalName || ""),
          cnpj: String(json.data.cnpj || ""),
          instagramHandle: String(json.data.instagramHandle || "").replace(/^@/, ""),
          phoneDisplay: String(json.data.phoneDisplay || ""),
          whatsappDigits: String(json.data.whatsappDigits || "").replace(/\D+/g, ""),
        });
      } else {
        setBrand(null);
      }
    } catch {
      setBrand(null);
    } finally {
      setBrandLoading(false);
    }
  }, []);

  useEffect(() => {
    loadViagensHoje();
    loadPresence();
    loadBrand();
  }, [loadViagensHoje, loadPresence, loadBrand]);

  useEffect(() => {
    ping();
    const t = setInterval(ping, 60_000);
    return () => clearInterval(t);
  }, [ping]);

  useEffect(() => {
    const t = setInterval(() => {
      loadPresence();
    }, 45_000);
    return () => clearInterval(t);
  }, [loadPresence]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative h-11 w-36 shrink-0 sm:h-12 sm:w-40">
          <Image
            src="/brand/lf-viagens-logo.png"
            alt="LF Viagens"
            fill
            className="object-contain object-left"
            sizes="160px"
            priority
          />
        </div>
        <div className="min-w-0 flex-1">
          <PageHeader
            title="Página inicial"
            description="Atalhos, voos com embarque hoje e presença da equipe."
            actions={<LogoutButton />}
            className="mb-0 border-0 pb-0"
          />
          <p className="mt-2 text-sm text-slate-600">
            Olá,{" "}
            <span className="font-medium text-slate-800">{session.name || session.login}</span>
          </p>
        </div>
      </div>

      <SectionCard
        title={
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 className="h-4 w-4 text-violet-600" aria-hidden />
            Empresa
          </span>
        }
      >
        {brandLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Carregando dados…
          </div>
        ) : brand ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Marca</dt>
              <dd className="font-medium text-slate-900">{brand.companyDisplayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Razão social</dt>
              <dd className="text-slate-800">{brand.companyLegalName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">CNPJ</dt>
              <dd className="font-mono text-slate-800">{brand.cnpj}</dd>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Telefone</dt>
                <dd className="text-slate-800">{brand.phoneDisplay}</dd>
              </div>
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 pt-1">
              <a
                href={`https://instagram.com/${brand.instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-sky-700 underline-offset-4 hover:underline"
              >
                Instagram @{brand.instagramHandle}
              </a>
              <a
                href={`https://wa.me/${brand.whatsappDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
              >
                WhatsApp
              </a>
              {session.role === "admin" ? (
                <Link
                  href="/dashboard/configuracoes"
                  className="text-sm font-medium text-violet-700 underline-offset-4 hover:underline"
                >
                  Editar em Configurações
                </Link>
              ) : null}
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Não foi possível carregar os dados da empresa.</p>
        )}
      </SectionCard>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Atalhos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ShortcutCard
            href="/dashboard/vendas/nova"
            title="Efetuar venda"
            description="Registrar nova venda de milhas."
            icon={<Store className="h-5 w-5" strokeWidth={2} />}
            tone="sky"
          />
          <ShortcutCard
            href="/dashboard/compras/nova"
            title="Efetuar compra"
            description="Abrir nova compra de pontos."
            icon={<ShoppingCart className="h-5 w-5" strokeWidth={2} />}
            tone="emerald"
          />
          <ShortcutCard
            href="/dashboard/vendas"
            title="Painel de vendas"
            description="Visão geral das vendas e fluxos."
            icon={<LayoutDashboard className="h-5 w-5" strokeWidth={2} />}
            tone="indigo"
          />
          <ShortcutCard
            href="/dashboard/comissoes/funcionarios"
            title="Comissão dos funcionários"
            description="Comissões e pagamentos da equipe."
            icon={<Users className="h-5 w-5" strokeWidth={2} />}
            tone="amber"
          />
          <ShortcutCard
            href="/dashboard/emissoes-balcao/compra-venda"
            title="Emissões no balcão"
            description="Compra e venda de milhas no balcão."
            icon={<Plane className="h-5 w-5" strokeWidth={2} />}
            tone="indigo"
          />
          <ShortcutCard
            href="/dashboard/operador-vendas/consolidadora"
            title="Consolidadora"
            description="Vendas por consolidadora, comissão e liberação."
            icon={<Building2 className="h-5 w-5" strokeWidth={2} />}
            tone="teal"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 text-sky-600" aria-hidden />
              Voos — embarque hoje
            </span>
          }
        >
          {viagensLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Carregando…
            </div>
          ) : viagensError ? (
            <p className="text-sm text-rose-600">{viagensError}</p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Vendas com localizador e data de embarque hoje (Recife). Detalhes na agenda de viagens.
              </p>
              <ul className="mt-4 space-y-2">
                {viagensHoje.length === 0 ? (
                  <li className="text-sm text-slate-500">Nenhum embarque cadastrado para hoje.</li>
                ) : (
                  viagensHoje.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm"
                    >
                      <div className="font-mono font-semibold text-sky-800">{v.locator}</div>
                      <div className="text-slate-700">
                        {v.cliente.nome}{" "}
                        <span className="text-xs text-slate-500">({v.program})</span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <Link
                href="/dashboard/agenda"
                className="mt-4 inline-flex text-sm font-medium text-sky-700 underline-offset-4 hover:text-sky-900 hover:underline"
              >
                Abrir agenda de viagens
              </Link>
            </>
          )}
        </SectionCard>

        <SectionCard
          title={
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <UsersRound className="h-4 w-4 text-emerald-600" aria-hidden />
              Equipe — quem está online
            </span>
          }
        >
          <p className="text-xs leading-relaxed text-slate-600">
            Verde = sinal do painel nos últimos 3 minutos (ping automático a cada 1 min enquanto você
            navega no sistema). Indicador aproximado.
          </p>
          {presenceLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Carregando…
            </div>
          ) : presenceError ? (
            <p className="mt-4 text-sm text-rose-600">{presenceError}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2 text-sm"
                >
                  <span
                    className={
                      m.isOnline
                        ? "h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
                        : "h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300"
                    }
                    title={m.isOnline ? "Online" : "Ausente"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{m.name}</div>
                    <div className="text-xs text-slate-500">{m.login}</div>
                  </div>
                  {m.id === session.id ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase text-sky-600">
                      Você
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
