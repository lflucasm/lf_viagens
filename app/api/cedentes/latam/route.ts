// app/api/cedentes/latam/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LATAM_ANUAL_PASSAGEIROS_LIMITE = 25;
const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function ok(json: any, status = 200) {
  return new NextResponse(JSON.stringify({ ok: true, ...json }), {
    status,
    headers: noCacheHeaders(),
  });
}

function bad(message: string, status = 400) {
  return new NextResponse(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: noCacheHeaders(),
  });
}

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

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

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

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

function scoreMedia(score?: {
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

function startOfMonthUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
function addMonthsUTC(d: Date, m: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1, 0, 0, 0, 0));
}

function isoDateNowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* =========================
   GET
========================= */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const ownerId = (url.searchParams.get("ownerId") || "").trim();

    const hideBlocked = ["1", "true", "yes", "on"].includes(
      (url.searchParams.get("hideBlocked") || "").toLowerCase()
    );

    const whereCedente: any = {
      status: "APPROVED",
      owner: { team: session.team },
      AND: [],
    };

    if (ownerId) whereCedente.AND.push({ ownerId });

    if (q) {
      whereCedente.AND.push({
        OR: [
          { nomeCompleto: { contains: q, mode: "insensitive" } },
          { identificador: { contains: q, mode: "insensitive" } },
          { cpf: { contains: q } },
        ],
      });
    }

    // "só LATAM": reduz lista para quem tem LATAM configurado/útil
    whereCedente.AND.push({
      OR: [{ pontosLatam: { gt: 0 } }, { senhaLatamPass: { not: null } }],
    });

    const cedentesRaw = await prisma.cedente.findMany({
      where: whereCedente,
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        telefone: true,
        emailCriado: true,
        senhaEmail: true,
        senhaLatamPass: true,
        pontosLatam: true,
        score: {
          select: {
            rapidezBiometria: true,
            rapidezSms: true,
            resolucaoProblema: true,
            confianca: true,
          },
        },
        owner: { select: { id: true, name: true, login: true } },
      },
      orderBy: { nomeCompleto: "asc" },
      take: 2000,
    });

    const idsRaw = cedentesRaw.map((c) => c.id);
    if (idsRaw.length === 0) return ok({ rows: [] });

    // =========================
    // BLOQUEADOS LATAM (BlockedAccount OPEN)
    // =========================
    const blockedLatam = await prisma.blockedAccount.findMany({
      where: {
        cedenteId: { in: idsRaw },
        program: "LATAM",
        status: "OPEN",
      },
      select: { cedenteId: true },
    });

    const blockedSet = new Set(blockedLatam.map((b) => b.cedenteId));

    const cedentes = hideBlocked
      ? cedentesRaw.filter((c) => !blockedSet.has(c.id))
      : cedentesRaw;

    const ids = cedentes.map((c) => c.id);
    if (ids.length === 0) return ok({ rows: [] });

    // =========================
    // Pendentes LATAM (PurchaseItem PENDING)
    // =========================
    const pendingItems = await prisma.purchaseItem.findMany({
      where: {
        status: "PENDING",
        pointsFinal: { gt: 0 },
        purchase: {
          cedenteId: { in: ids },
          status: "OPEN",
        },
        OR: [{ programTo: "LATAM" }, { programTo: null, purchase: { ciaAerea: "LATAM" } }],
      },
      select: {
        pointsFinal: true,
        purchase: { select: { cedenteId: true } },
      },
    });

    const pendingMap = new Map<string, number>();
    for (const it of pendingItems) {
      const cid = it.purchase.cedenteId;
      pendingMap.set(cid, (pendingMap.get(cid) || 0) + (it.pointsFinal || 0));
    }

    // =========================
    // Emissões LATAM (janela 12 meses por mês) (EmissionEvent)
    // =========================
    const now = new Date();
    const m0 = startOfMonthUTC(now);
    const w0 = addMonthsUTC(m0, -12);
    const w1 = addMonthsUTC(m0, 1);

    const grouped = await prisma.emissionEvent.groupBy({
      by: ["cedenteId"],
      where: {
        program: "LATAM",
        cedenteId: { in: ids },
        issuedAt: { gte: w0, lt: w1 },
      },
      _sum: { passengersCount: true },
    });

    const usedMap = new Map<string, number>();
    for (const g of grouped) {
      usedMap.set(g.cedenteId, Number(g._sum.passengersCount || 0));
    }

    const promoDate = isoDateNowSP();
    const promoTodayItems = await prisma.latamPromoListItem.findMany({
      where: {
        team: session.team,
        listDate: promoDate,
        cedenteId: { in: ids },
      },
      select: { cedenteId: true },
    });
    const promoTodaySet = new Set(promoTodayItems.map((item) => item.cedenteId));

    const latamClubs = await prisma.clubSubscription.findMany({
      where: {
        team: session.team,
        program: "LATAM",
        cedenteId: { in: ids },
      },
      select: {
        cedenteId: true,
        status: true,
        subscribedAt: true,
        renewalDay: true,
        lastRenewedAt: true,
        createdAt: true,
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    });

    const latestLatamClubByCedente = new Map<string, (typeof latamClubs)[number]>();
    for (const club of latamClubs) {
      if (!latestLatamClubByCedente.has(club.cedenteId)) {
        latestLatamClubByCedente.set(club.cedenteId, club);
      }
    }

    const today = startUTC(new Date());

    // =========================
    // Monta resposta
    // =========================
    const rows = cedentes.map((c: any) => {
      const pend = pendingMap.get(c.id) || 0;
      const used = usedMap.get(c.id) || 0;
      const available = Math.max(0, LATAM_ANUAL_PASSAGEIROS_LIMITE - used);

      const latamBloqueado = blockedSet.has(c.id);
      const latestLatamClub = latestLatamClubByCedente.get(c.id);

      let latamClubAtivoAgora = false;
      if (latestLatamClub) {
        let desiredStatus = latestLatamClub.status;
        if (desiredStatus !== "CANCELED") {
          const auto = computeLatamAutoDates({
            subscribedAt: latestLatamClub.subscribedAt,
            renewalDay: latestLatamClub.renewalDay,
            lastRenewedAt: latestLatamClub.lastRenewedAt,
          });

          if (today.getTime() >= startUTC(auto.cancelAt).getTime()) {
            desiredStatus = "CANCELED";
          } else if (
            today.getTime() >= startUTC(auto.inactiveAt).getTime() &&
            desiredStatus === "ACTIVE"
          ) {
            desiredStatus = "PAUSED";
          }
        }

        latamClubAtivoAgora = desiredStatus === "ACTIVE";
      }

      return {
        id: c.id,
        identificador: c.identificador,
        nomeCompleto: c.nomeCompleto,
        cpf: c.cpf,
        telefone: c.telefone || null,
        emailCriado: c.emailCriado || null,
        senhaEmail: c.senhaEmail || null,
        senhaLatamPass: c.senhaLatamPass || null,
        owner: c.owner,
        scoreMedia: scoreMedia(c.score),

        latamAprovado: c.pontosLatam || 0,
        latamPendente: pend,
        latamTotalEsperado: (c.pontosLatam || 0) + pend,

        passageirosUsadosAno: used,
        passageirosDisponiveisAno: available,

        latamBloqueado,
        latamClubAtivoAgora,
        blockedPrograms: latamBloqueado ? (["LATAM"] as const) : [],
        onPromoListToday: promoTodaySet.has(c.id),
      };
    });

    return ok({ rows });
  } catch (e: any) {
    console.error(e);
    return bad(e?.message || "Erro interno", 500);
  }
}

/* =========================
   PATCH (inline edit pontosLatam)
========================= */
export async function PATCH(req: NextRequest) {
  try {
    // ✅ Tenta com req (se requireSession precisar), senão segue.
    const session = await (requireSession as any)(req);

    const body = await req.json().catch(() => null);
    const id = String(body?.id || "").trim();
    const pontosLatam = safeInt(body?.pontosLatam, NaN as any);

    if (!id) return bad("id é obrigatório");
    if (!Number.isFinite(pontosLatam) || pontosLatam < 0) {
      return bad("pontosLatam inválido");
    }

    const ced = await prisma.cedente.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!ced) return bad("Cedente não encontrado", 404);

    // ✅ extrai campos da sessão com fallbacks
    const s = session as any;

    const sessionLogin: string = String(
      s?.login ?? s?.user?.login ?? s?.username ?? s?.user?.username ?? ""
    );

    let sessionUserId: string = String(
      s?.userId ?? s?.user_id ?? s?.uid ?? s?.user?.id ?? s?.id ?? ""
    );

    let role: string = String(
      s?.role ?? s?.userRole ?? s?.user?.role ?? s?.perfil ?? s?.user?.perfil ?? ""
    );

    // ✅ se role não veio pela sessão, busca no DB (isso resolve “sou admin mas veio sem role”)
    if ((!role || role === "undefined") && (sessionUserId || sessionLogin)) {
      const u = await prisma.user.findFirst({
        where: sessionUserId ? { id: sessionUserId } : { login: sessionLogin },
        select: { id: true, role: true },
      });

      if (!sessionUserId && u?.id) sessionUserId = u.id;
      if (!role && u?.role) role = String(u.role);
    }

    const roleUp = String(role || "").toUpperCase();

    // ✅ admins/gestores podem editar qualquer cedente
    const isAdmin = ["ADMIN", "SUPERADMIN", "ROOT", "OWNER"].includes(roleUp);

    // ✅ fallback: se não tem role por algum motivo, ainda permite dono do cedente
    const isOwner = Boolean(sessionUserId) && ced.ownerId === sessionUserId;

    if (!isAdmin && !isOwner) return bad("Sem permissão", 403);

    await prisma.cedente.update({
      where: { id },
      data: { pontosLatam },
    });

    return ok({}); // { ok: true }
  } catch (e: any) {
    console.error(e);
    return bad(e?.message || "Erro interno", 500);
  }
}
