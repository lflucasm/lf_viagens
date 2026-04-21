// app/api/clubes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS = ["LATAM", "SMILES", "LIVELO", "ESFERA"] as const;
const STATUSES = ["ACTIVE", "PAUSED", "CANCELED"] as const;

type Program = (typeof PROGRAMS)[number];
type Status = (typeof STATUSES)[number];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toInt(v: unknown, fallback?: number) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normUpper(v?: string | null) {
  const s = (v || "").trim();
  return s ? s.toUpperCase() : "";
}

function normalizeProgram(v?: string | null): Program | undefined {
  const up = normUpper(v);
  if (!up) return undefined;
  return (PROGRAMS as readonly string[]).includes(up) ? (up as Program) : undefined;
}

function normalizeStatus(v?: string | null): Status | undefined {
  const up = normUpper(v);
  if (!up) return undefined;
  return (STATUSES as readonly string[]).includes(up) ? (up as Status) : undefined;
}

function prismaMsg(e: any) {
  const code = String(e?.code || "");
  if (code === "P2002") return "Registro duplicado (chave única).";
  if (code === "P2025") return "Registro não encontrado.";
  return "Falha ao processar no banco.";
}

/** normaliza qualquer date para "início do dia" em UTC */
function startUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** datas em UTC para não “pular dia” por timezone */
function addDaysUTC(base: Date, days: number) {
  const d = startUTC(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysInMonthUTC(year: number, month0: number) {
  // dia 0 do mês seguinte = último dia do mês atual
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** dia X do mês seguinte ao base (clamp se mês não tem aquele dia) */
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

const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;
const SMILES_CANCEL_AFTER_INACTIVE_DAYS = 60;

// ✅ LIVELO: exatamente 30 dias após assinatura/renovação
const LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS = 30;

const SMILES_PROMO_DAYS = 365;

function computeAutoDates(input: {
  program: Program;
  subscribedAt: Date;
  renewalDay: number;
  lastRenewedAt: Date | null;
  // ✅ base do Promo SMILES por cedente = ÚLTIMA assinatura SMILES
  smilesPromoBaseAt?: Date | null;
}) {
  const { program, subscribedAt, renewalDay, lastRenewedAt } = input;

  let nextRenewalAt: Date | null = null;
  let inactiveAt: Date | null = null;
  let pointsExpireAt: Date | null = null;
  let smilesBonusEligibleAt: Date | null = null;

  if (program === "LATAM" || program === "SMILES") {
    const base = lastRenewedAt ?? subscribedAt;

    // ✅ SEMPRE mês seguinte (nunca no mesmo mês)
    nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);

    // fica inativo no dia seguinte
    inactiveAt = addDaysUTC(nextRenewalAt, 1);

    const cancelAfter =
      program === "LATAM"
        ? LATAM_CANCEL_AFTER_INACTIVE_DAYS
        : SMILES_CANCEL_AFTER_INACTIVE_DAYS;

    // cancela após X dias de inatividade
    pointsExpireAt = addDaysUTC(inactiveAt, cancelAfter);

    if (program === "SMILES") {
      const promoBase = input.smilesPromoBaseAt ?? subscribedAt; // ✅ usa a ÚLTIMA
      smilesBonusEligibleAt = addDaysUTC(promoBase, SMILES_PROMO_DAYS);
    }
  } else if (program === "LIVELO") {
    const base = lastRenewedAt ?? subscribedAt;
    inactiveAt = addDaysUTC(base, LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS);
    pointsExpireAt = inactiveAt;
    nextRenewalAt = inactiveAt;
  }

  return { nextRenewalAt, inactiveAt, pointsExpireAt, smilesBonusEligibleAt };
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { searchParams } = new URL(req.url);

  const cedenteId = (searchParams.get("cedenteId") || "").trim() || undefined;
  const programRaw = searchParams.get("program") || searchParams.get("programa") || undefined;
  const statusRaw = searchParams.get("status") || undefined;

  const qRaw = (searchParams.get("q") || "").trim();
  const q = qRaw ? qRaw.slice(0, 80) : undefined;

  const program = normalizeProgram(programRaw);
  const status = normalizeStatus(statusRaw);

  if (programRaw && !program) return bad("Program inválido");
  if (statusRaw && !status) return bad("Status inválido");

  // NÃO filtra status no banco (pra automação on-demand poder atualizar)
  const where: any = {
    team: session.team,
    ...(cedenteId ? { cedenteId } : {}),
    ...(program ? { program } : {}),
    ...(q
      ? {
          OR: [
            { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
            { cedente: { identificador: { contains: q, mode: "insensitive" } } },
            { cedente: { cpf: { contains: q } } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  try {
    const items = await prisma.clubSubscription.findMany({
      where,
      include: {
        cedente: {
          select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
        },
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    });

    const now = startUTC(new Date());

    // ✅ SMILES: ÚLTIMA assinatura por cedente (MAX) para promo+365
    const smilesCedenteIds = Array.from(
      new Set(items.filter((i) => i.program === "SMILES").map((i) => i.cedenteId))
    );

    const lastSmilesByCedente = new Map<string, Date>();
    if (smilesCedenteIds.length) {
      const grouped = await prisma.clubSubscription.groupBy({
        by: ["cedenteId"],
        where: {
          team: session.team,
          program: "SMILES" as any,
          cedenteId: { in: smilesCedenteIds },
        },
        _max: { subscribedAt: true },
      });

      for (const g of grouped) {
        if (g._max.subscribedAt) lastSmilesByCedente.set(g.cedenteId, g._max.subscribedAt);
      }
    }

    const updates: Promise<any>[] = [];

    for (const it of items as any[]) {
      const tierK = Math.min(20, Math.max(1, Number(it.tierK) || 10));
      const renewalDay = Math.min(31, Math.max(1, Number(it.renewalDay) || 1));

      const auto = computeAutoDates({
        program: it.program as Program,
        subscribedAt: it.subscribedAt as Date,
        renewalDay,
        lastRenewedAt: (it.lastRenewedAt as Date | null) ?? null,
        smilesPromoBaseAt:
          it.program === "SMILES" ? (lastSmilesByCedente.get(it.cedenteId) ?? null) : null,
      });

      // downgrade automático (não reativa sozinho)
      let desiredStatus: Status = it.status as Status;

      if (desiredStatus !== "CANCELED") {
        if (auto.pointsExpireAt && (it.program === "LATAM" || it.program === "SMILES")) {
          if (now >= startUTC(auto.pointsExpireAt)) desiredStatus = "CANCELED";
        }
        if (auto.inactiveAt && now >= startUTC(auto.inactiveAt) && desiredStatus === "ACTIVE") {
          desiredStatus = "PAUSED";
        }
      }

      const desired: any = {};
      let dirty = false;

      // normalizações
      if (it.priceCents !== 0) {
        desired.priceCents = 0;
        dirty = true;
      }
      if (it.tierK !== tierK) {
        desired.tierK = tierK;
        dirty = true;
      }
      if (it.renewalDay !== renewalDay) {
        desired.renewalDay = renewalDay;
        dirty = true;
      }

      // pointsExpireAt
      const curPE: Date | null = it.pointsExpireAt ?? null;
      const nxtPE: Date | null = auto.pointsExpireAt ?? null;
      const samePE =
        (!curPE && !nxtPE) ||
        (curPE && nxtPE && startUTC(curPE).getTime() === startUTC(nxtPE).getTime());

      if (!samePE) {
        desired.pointsExpireAt = nxtPE;
        dirty = true;
      }

      // SMILES promo: sempre recalcula e aplica igual em todos os registros do cedente
      if (it.program === "SMILES") {
        const curSB: Date | null = it.smilesBonusEligibleAt ?? null;
        const nxtSB: Date | null = auto.smilesBonusEligibleAt ?? null;

        const sameSB =
          (!curSB && !nxtSB) ||
          (curSB && nxtSB && startUTC(curSB).getTime() === startUTC(nxtSB).getTime());

        if (!sameSB) {
          desired.smilesBonusEligibleAt = nxtSB;
          dirty = true;
        }
      } else if (it.smilesBonusEligibleAt) {
        desired.smilesBonusEligibleAt = null;
        dirty = true;
      }

      if (it.status !== desiredStatus) {
        desired.status = desiredStatus;
        dirty = true;
      }

      if (dirty) {
        updates.push(
          prisma.clubSubscription.update({
            where: { id: it.id },
            data: desired,
          })
        );
        Object.assign(it, desired);
      }
    }

    if (updates.length) {
      await Promise.allSettled(updates);
    }

    const finalItems = status ? items.filter((i: any) => i.status === status) : items;
    return NextResponse.json({ ok: true, items: finalItems });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const cedenteId = String(body.cedenteId || "").trim();
  const program = normalizeProgram(body.program);
  const status = normalizeStatus(body.status || "ACTIVE");

  const tierKRaw = toInt(body.tierK, 10) ?? 10;
  const tierK = Math.min(20, Math.max(1, tierKRaw));
  const priceCents = 0;

  const subscribedAt = startUTC(toDate(body.subscribedAt) || new Date());
  const renewalDay = Math.min(31, Math.max(1, toInt(body.renewalDay, 1) ?? 1));

  const lastRenewedAtRaw = toDate(body.lastRenewedAt);
  const lastRenewedAt = lastRenewedAtRaw ? startUTC(lastRenewedAtRaw) : null;

  const renewedThisCycle = Boolean(body.renewedThisCycle ?? false);

  const notes =
    body.notes !== undefined && body.notes !== null
      ? String(body.notes).trim().slice(0, 500)
      : null;

  if (!cedenteId) return bad("cedenteId é obrigatório");
  if (!program) return bad("program inválido");
  if (!status) return bad("status inválido");

  try {
    const ced = await prisma.cedente.findFirst({
      where: { id: cedenteId, owner: { team: session.team } },
      select: { id: true },
    });
    if (!ced) return bad("Cedente não encontrado (ou não pertence ao seu time)", 404);

    // ✅ SMILES: base = última assinatura SMILES (MAX), incluindo o registro novo
    let promoBaseAt: Date | null = null;
    if (program === "SMILES") {
      const agg = await prisma.clubSubscription.aggregate({
        where: { team: session.team, cedenteId, program: "SMILES" as any },
        _max: { subscribedAt: true },
      });
      const last = agg._max.subscribedAt ? startUTC(agg._max.subscribedAt) : null;
      promoBaseAt = last && last.getTime() > subscribedAt.getTime() ? last : subscribedAt;
    }

    const auto = computeAutoDates({
      program,
      subscribedAt,
      renewalDay,
      lastRenewedAt,
      smilesPromoBaseAt: promoBaseAt,
    });

    const created = await prisma.clubSubscription.create({
      data: {
        team: session.team,
        cedenteId,
        program: program as any,
        tierK,
        priceCents,
        subscribedAt,
        renewalDay,
        lastRenewedAt,
        pointsExpireAt: auto.pointsExpireAt,
        renewedThisCycle,
        status: status as any,
        smilesBonusEligibleAt: auto.smilesBonusEligibleAt,
        notes,
      },
      include: {
        cedente: { select: { id: true, identificador: true, nomeCompleto: true, cpf: true } },
      },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}
