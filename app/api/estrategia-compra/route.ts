import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  LoyaltyProgram,
  ClubSubscriptionStatus,
  CedenteStatus,
  BlockStatus,
} from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Mode =
  | "AVAILABILITY"
  | "CLUB"
  | "COMBINED"
  | "BIRTHDAY_TURBO"
  | "BIRTHDAY_LATAM"
  | "HIGH_SCORE_CPF";
type ClubStatusOut = "ACTIVE" | "PAUSED" | "CANCELED" | "NONE";

const TURBO_MONTH_LIMIT = 100_000;
const TURBO_MIN_TRANSFERRED = 85_000;
const BIRTHDAY_TZ = "America/Sao_Paulo";

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function str(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}
function isProgram(v: any): v is LoyaltyProgram {
  return v === "LATAM" || v === "SMILES" || v === "LIVELO" || v === "ESFERA";
}

function monthNumberInTZ(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).formatToParts(
    date
  );
  const m = parts.find((p) => p.type === "month")?.value;
  return Number(m || 0);
}

function birthDayLabel(date: Date, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(
    date
  );
}

// ====== utils (LATAM turbo, UTC)
function startUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDaysUTC(base: Date, days: number) {
  const d = startUTC(base);
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
function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}
function parseMonthKeyUTC(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec((key || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { y, m0: mm - 1 };
}
function startOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0, 1, 0, 0, 0, 0));
}
function endOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0 + 1, 0, 23, 59, 59, 999));
}
function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function isBetweenUTC(d: Date, start: Date, end: Date) {
  const t = startUTC(d).getTime();
  return t >= startUTC(start).getTime() && t <= startUTC(end).getTime();
}

// ✅ últimos 365 dias (UTC) por DIA (inclui hoje)
function boundsLast365UTC() {
  const now = new Date();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );

  // hoje (1) + 364 dias anteriores = 365 dias
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  start.setUTCHours(0, 0, 0, 0);

  return { start, end };
}

const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;

function computeLatamAutoDates(input: {
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
}) {
  const renewalDay = clampInt(Number(input.renewalDay) || 1, 1, 31);
  const base = input.lastRenewedAt ?? input.subscribedAt;

  const nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);
  const inactiveAt = addDaysUTC(nextRenewalAt, 1);
  const activeUntil = addDaysUTC(inactiveAt, -1);
  const cancelAt = addDaysUTC(inactiveAt, LATAM_CANCEL_AFTER_INACTIVE_DAYS);

  return { nextRenewalAt, inactiveAt, activeUntil, cancelAt };
}

function programLabel(p: LoyaltyProgram) {
  // só para “plano”
  if (p === "LATAM") return "Latam";
  if (p === "SMILES") return "Smiles";
  if (p === "LIVELO") return "Livelo";
  return "Esfera";
}

function getPointsByProgram(c: {
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
}, p: LoyaltyProgram) {
  if (p === "LATAM") return c.pontosLatam || 0;
  if (p === "SMILES") return c.pontosSmiles || 0;
  if (p === "LIVELO") return c.pontosLivelo || 0;
  return c.pontosEsfera || 0;
}

function scoreRow(opts: {
  preferBankRemainder: boolean;
  requirePax: boolean;
  requireCpfs: boolean;
  clubRequired: boolean;
  clubOnlyActive: boolean;
  minBankPoints: number;
}, row: {
  ciaPoints: number;
  bankPoints: number;
  paxAvailable: number | null;
  cpfsAvailable: number | null;
  clubStatus: ClubStatusOut;
}) {
  // filtros duros
  if (opts.minBankPoints > 0 && row.bankPoints < opts.minBankPoints) return null;

  if (opts.requirePax && (row.paxAvailable ?? 0) <= 0) return null;
  if (opts.requireCpfs && (row.cpfsAvailable ?? 0) <= 0) return null;

  if (opts.clubRequired) {
    if (row.clubStatus === "NONE" || row.clubStatus === "CANCELED") return null;
    if (opts.clubOnlyActive && row.clubStatus !== "ACTIVE") return null;
  }

  // score
  let score = 0;

  if (opts.preferBankRemainder && row.bankPoints > 0) score += 600;

  // peso por pontos (sem estourar)
  score += Math.log10(1 + Math.max(0, row.bankPoints)) * 140;
  score += Math.log10(1 + Math.max(0, row.ciaPoints)) * 90;

  if ((row.paxAvailable ?? 0) > 0) score += 120;
  if ((row.cpfsAvailable ?? 0) > 0) score += 80;

  if (row.clubStatus === "ACTIVE") score += 70;
  if (row.clubStatus === "PAUSED") score += 35;

  return score;
}

function scoreMediaCedente(score?: {
  rapidezBiometria?: number;
  rapidezSms?: number;
  resolucaoProblema?: number;
  confianca?: number;
} | null) {
  const a = Number(score?.rapidezBiometria || 0);
  const b = Number(score?.rapidezSms || 0);
  const c = Number(score?.resolucaoProblema || 0);
  const d = Number(score?.confianca || 0);
  const avg = (a + b + c + d) / 4;
  return Math.round(avg * 100) / 100;
}

export async function POST(req: NextRequest) {
  // 🔒 garante logado
  const session: any = await requireSession();

  // tenta achar o team na sua sessão
  const team: string | undefined =
    session?.user?.team ?? session?.team ?? session?.session?.user?.team;

  if (!team) return bad("Sessão sem team (requireSession não retornou team)");

  const body = await req.json().catch(() => null);
  if (!body) return bad("Body inválido");

  const mode: Mode = body.mode;
  if (!mode) return bad("mode obrigatório");

  // ======= MODES: Aniversário + LATAM
  if (mode === "BIRTHDAY_TURBO" || mode === "BIRTHDAY_LATAM") {
    const isTurboMode = mode === "BIRTHDAY_TURBO";
    const monthKey = monthKeyUTC(new Date());
    const monthStart = startOfMonthUTCFromKey(monthKey);
    const monthEnd = endOfMonthUTCFromKey(monthKey);

    const today = startUTC(new Date());
    const currentBirthMonth = monthNumberInTZ(new Date(), BIRTHDAY_TZ);

    const cedentes = await prisma.cedente.findMany({
      where: {
        status: CedenteStatus.APPROVED,
        owner: { team },
        dataNascimento: { not: null },
      },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        dataNascimento: true,
        owner: { select: { id: true, name: true, login: true } },
      },
      orderBy: [{ nomeCompleto: "asc" }],
    });

    const birthdayCedentes = cedentes.filter(
      (c) =>
        c.dataNascimento &&
        monthNumberInTZ(c.dataNascimento, BIRTHDAY_TZ) === currentBirthMonth
    );

    if (!birthdayCedentes.length) {
      return NextResponse.json(
        {
          ok: true,
          rows: [],
          meta: {
            monthKey,
            ...(isTurboMode
              ? {
                  limitPoints: TURBO_MONTH_LIMIT,
                  minTransferred: TURBO_MIN_TRANSFERRED,
                }
              : {}),
          },
        },
        { headers: noCacheHeaders() }
      );
    }

    const birthdayIds = birthdayCedentes.map((c) => c.id);

    const clubs = await prisma.clubSubscription.findMany({
      where: {
        team,
        program: "LATAM",
        cedenteId: { in: birthdayIds },
      },
      select: {
        id: true,
        cedenteId: true,
        program: true,
        status: true,
        tierK: true,
        subscribedAt: true,
        renewalDay: true,
        lastRenewedAt: true,
        pointsExpireAt: true,
        createdAt: true,
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    });

    const latestClubByCedente = new Map<string, (typeof clubs)[number]>();
    for (const c of clubs) {
      if (!latestClubByCedente.has(c.cedenteId)) latestClubByCedente.set(c.cedenteId, c);
    }

    const markByCedente = new Map<
      string,
      { cedenteId: string; status: string; points: number }
    >();
    if (isTurboMode) {
      const monthMarks = await prisma.latamTurboMonth.findMany({
        where: {
          team,
          monthKey,
          cedenteId: { in: birthdayIds },
        },
        select: { cedenteId: true, status: true, points: true },
      });
      for (const m of monthMarks) {
        markByCedente.set(m.cedenteId, {
          cedenteId: m.cedenteId,
          status: m.status,
          points: m.points,
        });
      }
    }

    const accounts = await prisma.latamTurboAccount.findMany({
      where: { team, cedenteId: { in: birthdayIds } },
      select: { cedenteId: true, cpfLimit: true, cpfUsed: true },
    });

    const accByCedente = new Map<string, { cpfLimit: number; cpfUsed: number }>();
    for (const a of accounts) accByCedente.set(a.cedenteId, { cpfLimit: a.cpfLimit, cpfUsed: a.cpfUsed });

    const { start: yStart, end: yEnd } = boundsLast365UTC();
    const usedAgg = await prisma.emissionEvent.groupBy({
      by: ["cedenteId"],
      where: {
        program: LoyaltyProgram.LATAM,
        issuedAt: { gte: yStart, lte: yEnd },
        cedenteId: { in: birthdayIds },
      },
      _sum: { passengersCount: true },
    });

    const usedCalcByCedente = new Map<string, number>(
      usedAgg.map((x) => [x.cedenteId, Number(x._sum.passengersCount || 0)])
    );

    const rows = birthdayCedentes
      .map((c) => {
        const club = latestClubByCedente.get(c.id) || null;

        let effectiveStatus: ClubStatusOut = "NONE";
        let clubPlan: string | null = null;
        let inactiveInMonth = false;
        let cancelAtIso: string | null = null;

        if (club) {
          const auto = computeLatamAutoDates({
            subscribedAt: club.subscribedAt,
            renewalDay: clampInt(Number(club.renewalDay) || 1, 1, 31),
            lastRenewedAt: club.lastRenewedAt,
          });

          let st = club.status as ClubSubscriptionStatus;
          if (st !== "CANCELED") {
            if (today.getTime() >= startUTC(auto.cancelAt).getTime()) {
              st = "CANCELED";
            } else if (
              today.getTime() >= startUTC(auto.inactiveAt).getTime() &&
              st === "ACTIVE"
            ) {
              st = "PAUSED";
            }
          }

          effectiveStatus =
            st === "ACTIVE" ? "ACTIVE" : st === "PAUSED" ? "PAUSED" : "CANCELED";
          clubPlan = `${programLabel(club.program)} ${club.tierK || 0}k`;

          inactiveInMonth =
            Boolean(monthStart && monthEnd) &&
            isBetweenUTC(auto.inactiveAt, monthStart!, monthEnd!);
          cancelAtIso = inactiveInMonth ? auto.cancelAt.toISOString() : null;
        }

        if (isTurboMode && effectiveStatus !== "ACTIVE") return null;

        const mark = markByCedente.get(c.id) || null;
        const transferredPoints =
          mark && mark.status !== "SKIPPED" ? safeInt(mark.points, 0) : 0;

        if (isTurboMode && transferredPoints >= TURBO_MIN_TRANSFERRED) return null;

        const remainingPoints = Math.max(0, TURBO_MONTH_LIMIT - transferredPoints);

        const acc = accByCedente.get(c.id) || { cpfLimit: 25, cpfUsed: 0 };
        const cpfLimit = clampInt(safeInt(acc.cpfLimit, 25), 0, 999);
        const usedCalc = clampInt(safeInt(usedCalcByCedente.get(c.id) ?? 0, 0), 0, 999);
        const usedManual = clampInt(safeInt(acc.cpfUsed, 0), 0, 999);
        const cpfUsed = Math.max(usedCalc, usedManual);
        const cpfFree = Math.max(0, cpfLimit - cpfUsed);

        const baseRow = {
          cedenteId: c.id,
          cedenteNome: c.nomeCompleto,
          cedenteIdentificador: c.identificador,
          cpf: c.cpf,
          owner: c.owner,
          birthDay: c.dataNascimento ? birthDayLabel(c.dataNascimento, BIRTHDAY_TZ) : null,
          paxAvailable: cpfFree,
          cpfAvailableLatam: cpfFree,
          clubStatus: effectiveStatus,
          clubPlan,
        };

        if (!isTurboMode) return baseRow;

        return {
          ...baseRow,
          turbo: {
            status: mark?.status || "NONE",
            transferredPoints,
            remainingPoints,
            willInactivate: inactiveInMonth,
            cancelAt: cancelAtIso,
          },
        };
      })
      .filter(Boolean) as any[];

    if (isTurboMode) {
      rows.sort((a, b) => {
        const ra = Number(a?.turbo?.remainingPoints || 0);
        const rb = Number(b?.turbo?.remainingPoints || 0);
        if (rb !== ra) return rb - ra;
        const da = a?.birthDay ? a.birthDay : "";
        const db = b?.birthDay ? b.birthDay : "";
        if (da !== db) return da.localeCompare(db);
        return String(a?.cedenteNome || "").localeCompare(String(b?.cedenteNome || ""));
      });
    } else {
      rows.sort((a, b) => {
        const sa = a?.clubStatus === "ACTIVE" ? 3 : a?.clubStatus === "PAUSED" ? 2 : a?.clubStatus === "NONE" ? 1 : 0;
        const sb = b?.clubStatus === "ACTIVE" ? 3 : b?.clubStatus === "PAUSED" ? 2 : b?.clubStatus === "NONE" ? 1 : 0;
        if (sb !== sa) return sb - sa;
        const ca = Number(a?.cpfAvailableLatam || 0);
        const cb = Number(b?.cpfAvailableLatam || 0);
        if (cb !== ca) return cb - ca;
        const da = a?.birthDay ? a.birthDay : "";
        const db = b?.birthDay ? b.birthDay : "";
        if (da !== db) return da.localeCompare(db);
        return String(a?.cedenteNome || "").localeCompare(String(b?.cedenteNome || ""));
      });
    }

    return NextResponse.json(
      {
        ok: true,
        rows,
        meta: {
          monthKey,
          ...(isTurboMode
            ? {
                limitPoints: TURBO_MONTH_LIMIT,
                minTransferred: TURBO_MIN_TRANSFERRED,
              }
            : {}),
        },
      },
      { headers: noCacheHeaders() }
    );
  }

  // ======= MODE: Score alto + maior CPF LATAM disponível
  if (mode === "HIGH_SCORE_CPF") {
    const cedentes = await prisma.cedente.findMany({
      where: {
        status: CedenteStatus.APPROVED,
        owner: { team },
      },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        owner: { select: { id: true, name: true, login: true } },
        score: {
          select: {
            rapidezBiometria: true,
            rapidezSms: true,
            resolucaoProblema: true,
            confianca: true,
          },
        },
        latamTurboAccount: {
          select: { cpfLimit: true, cpfUsed: true },
        },
      },
      orderBy: [{ nomeCompleto: "asc" }],
    });

    if (!cedentes.length) {
      return NextResponse.json(
        {
          ok: true,
          rows: [],
          meta: { base: "LATAM_365D" },
        },
        { headers: noCacheHeaders() }
      );
    }

    const cedenteIds = cedentes.map((c) => c.id);
    const { start: yStart, end: yEnd } = boundsLast365UTC();

    const usedAgg = await prisma.emissionEvent.groupBy({
      by: ["cedenteId"],
      where: {
        program: LoyaltyProgram.LATAM,
        issuedAt: { gte: yStart, lte: yEnd },
        cedenteId: { in: cedenteIds },
      },
      _sum: { passengersCount: true },
    });

    const usedCalcByCedente = new Map<string, number>(
      usedAgg.map((x) => [x.cedenteId, Number(x._sum.passengersCount || 0)])
    );

    const rows = cedentes.map((c) => {
      const scoreMedia = scoreMediaCedente(c.score);

      const acc = c.latamTurboAccount || { cpfLimit: 25, cpfUsed: 0 };
      const cpfLimit = clampInt(safeInt(acc.cpfLimit, 25), 0, 999);
      const usedCalc = clampInt(safeInt(usedCalcByCedente.get(c.id) ?? 0, 0), 0, 999);
      const usedManual = clampInt(safeInt(acc.cpfUsed, 0), 0, 999);
      const cpfUsed = Math.max(usedCalc, usedManual);
      const cpfAvailableLatam = Math.max(0, cpfLimit - cpfUsed);

      return {
        cedenteId: c.id,
        cedenteNome: c.nomeCompleto,
        cedenteIdentificador: c.identificador,
        cpf: c.cpf,
        owner: c.owner,
        scoreMedia,
        score: {
          rapidezBiometria: Number(c.score?.rapidezBiometria || 0),
          rapidezSms: Number(c.score?.rapidezSms || 0),
          resolucaoProblema: Number(c.score?.resolucaoProblema || 0),
          confianca: Number(c.score?.confianca || 0),
        },
        cpfLimit,
        cpfUsed,
        cpfAvailableLatam,
      };
    });

    rows.sort((a, b) => {
      if (b.scoreMedia !== a.scoreMedia) return b.scoreMedia - a.scoreMedia;
      if (b.cpfAvailableLatam !== a.cpfAvailableLatam) return b.cpfAvailableLatam - a.cpfAvailableLatam;
      return a.cedenteNome.localeCompare(b.cedenteNome);
    });

    return NextResponse.json(
      {
        ok: true,
        rows,
        meta: { base: "LATAM_365D" },
      },
      { headers: noCacheHeaders() }
    );
  }

  // ======= parse params (mantém compatível com a UI anterior)
  const ciaRaw = body.cia ?? body?.combined?.cia ?? null;
  const bankRaw = body.bank ?? body?.combined?.bank ?? null;

  const cia = isProgram(ciaRaw) ? (ciaRaw as LoyaltyProgram) : null;
  const bank = isProgram(bankRaw) ? (bankRaw as LoyaltyProgram) : null;

  // clube
  const clubProgramRaw =
    body?.club?.program ?? body?.combined?.club?.program ?? null;
  const clubProgram = isProgram(clubProgramRaw) ? (clubProgramRaw as LoyaltyProgram) : null;

  const clubOnlyActive =
    !!body?.club?.onlyActive || !!body?.combined?.club?.onlyActive;

  const clubPlanFilter = str(body?.club?.plan ?? body?.combined?.club?.plan) || null;

  // regras
  let preferBankRemainder = false;
  let requirePax = false;
  let requireCpfs = false;
  let clubRequired = false;
  let minBankPoints = 0;

  if (mode === "AVAILABILITY") {
    preferBankRemainder = !!body.preferBankRemainder;
    requirePax = !!body.requirePax;
    requireCpfs = !!body.requireCpfs;
    minBankPoints = n(body.minBankPoints);
  } else if (mode === "CLUB") {
    // aqui a regra é “tem clube”, mas você pode obrigar ativo pelo checkbox
    clubRequired = true;
    preferBankRemainder = false;
    requirePax = false;
    requireCpfs = false;
  } else if (mode === "COMBINED") {
    preferBankRemainder = !!body?.combined?.preferBankRemainder;
    requirePax = !!body?.combined?.requirePax;
    requireCpfs = !!body?.combined?.requireCpfs;
    clubRequired = !!body?.combined?.clubRequired;
    minBankPoints = n(body?.combined?.minBankPoints);
  }

  // ======= quais programas precisamos olhar pra bloquear/clube
  const neededPrograms = new Set<LoyaltyProgram>();
  if (cia) neededPrograms.add(cia);
  if (bank) neededPrograms.add(bank);
  if (clubProgram) neededPrograms.add(clubProgram);

  // ======= define “programa de emissão” (pra paxUsed365)
  // prioridade: cia (se estiver usando) senão clubProgram se for cia.
  const paxProgram: LoyaltyProgram | null =
    cia === "LATAM" || cia === "SMILES"
      ? cia
      : (clubProgram === "LATAM" || clubProgram === "SMILES")
        ? clubProgram
        : null;

  // ======= Busca cedentes do time
  // OBS: Cedente não tem team, então filtramos pelo owner.team
  const cedentes = await prisma.cedente.findMany({
    where: {
      status: CedenteStatus.APPROVED,
      owner: { team },
    },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,

      pontosLatam: true,
      pontosSmiles: true,
      pontosLivelo: true,
      pontosEsfera: true,

      blockedAccounts: {
        where: {
          status: BlockStatus.OPEN,
          program: neededPrograms.size ? { in: Array.from(neededPrograms) } : undefined,
        },
        select: { program: true },
      },

      clubSubscriptions: {
        where: {
          status: { in: [ClubSubscriptionStatus.ACTIVE, ClubSubscriptionStatus.PAUSED] },
          program: neededPrograms.size ? { in: Array.from(neededPrograms) } : undefined,
        },
        select: { program: true, tierK: true, status: true },
      },

      latamTurboAccount: {
        select: { cpfLimit: true, cpfUsed: true },
      },
    },
  });

  const cedenteIds = cedentes.map((c) => c.id);

  // ======= pax usados (últimos 365 dias) por cedente+program (só se tiver paxProgram)
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const paxUsedMap = new Map<string, number>(); // key = `${cedenteId}:${program}`
  if (paxProgram && cedenteIds.length) {
    const aggs = await prisma.emissionEvent.groupBy({
      by: ["cedenteId", "program"],
      where: {
        cedenteId: { in: cedenteIds },
        program: paxProgram,
        issuedAt: { gte: since },
      },
      _sum: { passengersCount: true },
    });

    for (const a of aggs) {
      const key = `${a.cedenteId}:${a.program}`;
      paxUsedMap.set(key, a._sum.passengersCount ?? 0);
    }
  }

  // ======= helper pra achar clube “relevante”
  function pickClubFor(ced: (typeof cedentes)[number], prefer: LoyaltyProgram | null) {
    if (!prefer) return { status: "NONE" as ClubStatusOut, plan: null as string | null };

    const subs = ced.clubSubscriptions.filter((s) => s.program === prefer);
    if (!subs.length) return { status: "NONE" as ClubStatusOut, plan: null as string | null };

    // prioriza ACTIVE, depois maior tier
    subs.sort((a, b) => {
      const aw = a.status === "ACTIVE" ? 2 : 1;
      const bw = b.status === "ACTIVE" ? 2 : 1;
      if (bw !== aw) return bw - aw;
      return (b.tierK ?? 0) - (a.tierK ?? 0);
    });

    const best = subs[0];
    const plan = `${programLabel(best.program)} ${best.tierK || 0}k`;
    const st: ClubStatusOut = best.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
    return { status: st, plan };
  }

  // ======= monta candidates
  const rows = [];

  for (const c of cedentes) {
    const blocked = new Set(c.blockedAccounts.map((b) => b.program));

    // -------- MODE: CLUB
    if (mode === "CLUB") {
      if (!clubProgram) continue;

      // deve ter clube nesse program
      const club = pickClubFor(c, clubProgram);

      if (club.status === "NONE") continue;
      if (clubOnlyActive && club.status !== "ACTIVE") continue;

      if (clubPlanFilter) {
        const ok = (club.plan || "").toLowerCase().includes(clubPlanFilter.toLowerCase());
        if (!ok) continue;
      }

      // se esse program estiver bloqueado, pula
      if (blocked.has(clubProgram)) continue;

      const isAirline = clubProgram === "LATAM" || clubProgram === "SMILES";
      const ciaP = isAirline ? clubProgram : null;
      const bankP = !isAirline ? clubProgram : null;

      const ciaPoints = ciaP ? getPointsByProgram(c, ciaP) : 0;
      const bankPoints = bankP ? getPointsByProgram(c, bankP) : 0;

      // pax/cpf (no modo clube, só faz sentido se for cia)
      const paxLimitDefault = 25;
      const paxUsed = paxProgram && ciaP ? (paxUsedMap.get(`${c.id}:${ciaP}`) ?? 0) : 0;
      const paxAvailable = ciaP ? Math.max(0, paxLimitDefault - paxUsed) : null;

      const turbo = c.latamTurboAccount;
      const cpfsAvailable =
        turbo ? Math.max(0, (turbo.cpfLimit ?? 0) - (turbo.cpfUsed ?? 0)) : (paxAvailable ?? null);

      const score = scoreRow(
        {
          preferBankRemainder: false,
          requirePax: false,
          requireCpfs: false,
          clubRequired: true,
          clubOnlyActive,
          minBankPoints: 0,
        },
        { ciaPoints, bankPoints, paxAvailable, cpfsAvailable, clubStatus: club.status }
      );

      if (score === null) continue;

      rows.push({
        cedenteId: c.id,
        cedenteNome: c.nomeCompleto,
        cedenteIdentificador: c.identificador,

        cia: ciaP,
        bank: bankP,

        ciaPoints,
        bankPoints,

        paxAvailable,
        cpfsAvailable,

        clubStatus: club.status,
        clubPlan: club.plan,

        score,
        notes: [],
      });

      continue;
    }

    // -------- MODE: AVAILABILITY / COMBINED
    if (!cia || !bank) continue;

    // se cia/bank bloqueados, pula
    if (blocked.has(cia) || blocked.has(bank)) continue;

    // se combinado com clube obrigatório, valida clube
    let clubStatus: ClubStatusOut = "NONE";
    let clubPlan: string | null = null;

    if (clubRequired) {
      if (!clubProgram) continue;

      const club = pickClubFor(c, clubProgram);

      if (club.status === "NONE") continue;
      if (clubOnlyActive && club.status !== "ACTIVE") continue;

      if (clubPlanFilter) {
        const ok = (club.plan || "").toLowerCase().includes(clubPlanFilter.toLowerCase());
        if (!ok) continue;
      }

      clubStatus = club.status;
      clubPlan = club.plan;
    } else {
      // opcional: mostra clube do banco (se existir), senão da cia
      const club = pickClubFor(c, bank) .status !== "NONE"
        ? pickClubFor(c, bank)
        : pickClubFor(c, cia);

      clubStatus = club.status;
      clubPlan = club.plan;
    }

    const ciaPoints = getPointsByProgram(c, cia);
    const bankPoints = getPointsByProgram(c, bank);

    // pax disponíveis (rolling 365d) — default 25
    const paxLimitDefault = 25;
    const paxUsed = paxProgram ? (paxUsedMap.get(`${c.id}:${paxProgram}`) ?? 0) : 0;
    const paxAvailable = paxProgram ? Math.max(0, paxLimitDefault - paxUsed) : null;

    // cpfs disponíveis (prioriza LatamTurboAccount se existir)
    const turbo = c.latamTurboAccount;
    const cpfsAvailable =
      turbo ? Math.max(0, (turbo.cpfLimit ?? 0) - (turbo.cpfUsed ?? 0)) : (paxAvailable ?? null);

    const score = scoreRow(
      {
        preferBankRemainder,
        requirePax,
        requireCpfs,
        clubRequired,
        clubOnlyActive,
        minBankPoints,
      },
      { ciaPoints, bankPoints, paxAvailable, cpfsAvailable, clubStatus }
    );

    if (score === null) continue;

    rows.push({
      cedenteId: c.id,
      cedenteNome: c.nomeCompleto,
      cedenteIdentificador: c.identificador,

      cia,
      bank,

      ciaPoints,
      bankPoints,

      paxAvailable,
      cpfsAvailable,

      clubStatus,
      clubPlan,

      score,
      notes: [],
    });
  }

  rows.sort((a: any, b: any) => b.score - a.score);

  return NextResponse.json({ ok: true, rows }, { headers: noCacheHeaders() });
}
