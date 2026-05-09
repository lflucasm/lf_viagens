"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  Loader2,
  ShoppingCart,
  Store,
  Users,
  UsersRound,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/dashboard";
import LogoutButton from "@/components/LogoutButton";
import { ShortcutCard } from "@/components/ui/dashboard-cards";

type AgendaEvent = {
  id: string;
  type: "SHIFT" | "ABSENCE";
  dateISO: string;
  startHHMM: string;
  endHHMM: string;
  note: string;
  user: { id: string; name: string; login: string };
};

type PresenceMember = {
  id: string;
  name: string;
  login: string;
  updatedAt: string;
  isOnline: boolean;
};

function mesBRRecife(d = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  return `${month}/${year}`;
}

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

function minutesNowRecife(): number {
  const t = new Date().toLocaleTimeString("en-GB", {
    timeZone: "America/Recife",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [hh, mm] = t.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function parseHHMMToMin(s: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export default function DashboardHomeClient({
  session,
}: {
  session: { id: string; login: string; name?: string; team: string; role: string };
}) {
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [todayEvents, setTodayEvents] = useState<AgendaEvent[]>([]);

  const [presenceLoading, setPresenceLoading] = useState(true);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [members, setMembers] = useState<PresenceMember[]>([]);

  const todayISO = useMemo(() => todayISORecife(), []);
  const mesBR = useMemo(() => mesBRRecife(), []);

  const loadAgenda = useCallback(async () => {
    setAgendaLoading(true);
    setAgendaError(null);
    try {
      const res = await fetch(`/api/agenda?mes=${encodeURIComponent(mesBR)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) throw new Error(json?.error || "Erro ao carregar agenda.");
      const events: AgendaEvent[] = json.data?.events || [];
      setTodayEvents(events.filter((e) => e.dateISO === todayISO));
    } catch (e) {
      setAgendaError(e instanceof Error ? e.message : "Erro ao carregar agenda.");
      setTodayEvents([]);
    } finally {
      setAgendaLoading(false);
    }
  }, [mesBR, todayISO]);

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

  useEffect(() => {
    loadAgenda();
    loadPresence();
  }, [loadAgenda, loadPresence]);

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

  const nowMin = minutesNowRecife();

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
            description="Atalhos, agenda do dia e presença da equipe."
            actions={<LogoutButton />}
            className="mb-0 border-0 pb-0"
          />
          <p className="mt-2 text-sm text-slate-600">
            Olá,{" "}
            <span className="font-medium text-slate-800">{session.name || session.login}</span>
            <span className="text-slate-500"> · {session.team}</span>
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Atalhos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 text-sky-600" aria-hidden />
              Agenda do dia
            </span>
          }
        >
          {agendaLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Carregando…
            </div>
          ) : agendaError ? (
            <p className="text-sm text-rose-600">{agendaError}</p>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Eventos de hoje
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Fundo verde = turno no horário atual (Recife); a pessoa deve estar online agora.
              </p>
              <ul className="mt-4 space-y-2">
                {todayEvents.length === 0 ? (
                  <li className="text-sm text-slate-500">Nenhum evento agendado para hoje.</li>
                ) : (
                  todayEvents.map((ev) => {
                    const start = parseHHMMToMin(ev.startHHMM);
                    const end = parseHHMMToMin(ev.endHHMM);
                    const inShift =
                      ev.type === "SHIFT" &&
                      Number.isFinite(start) &&
                      Number.isFinite(end) &&
                      nowMin >= start &&
                      nowMin <= end;
                    return (
                      <li
                        key={ev.id}
                        className={
                          inShift
                            ? "rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm"
                            : "rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm"
                        }
                      >
                        <div className="font-medium text-slate-900">
                          {ev.startHHMM} – {ev.endHHMM}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {ev.type === "SHIFT" ? "Turno" : "Ausência"}
                          </span>
                        </div>
                        <div className="text-slate-700">{ev.user.name}</div>
                        {ev.note ? <div className="text-xs text-slate-500">{ev.note}</div> : null}
                      </li>
                    );
                  })
                )}
              </ul>
              <Link
                href="/dashboard/agenda"
                className="mt-4 inline-flex text-sm font-medium text-sky-700 underline-offset-4 hover:text-sky-900 hover:underline"
              >
                Abrir agenda completa
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
