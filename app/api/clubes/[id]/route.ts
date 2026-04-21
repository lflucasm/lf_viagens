// app/api/clubes/[id]/route.ts
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

/* ======================
   Regras de automação
====================== */
const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;
const SMILES_CANCEL_AFTER_INACTIVE_DAYS = 60;
const LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS = 30;
const SMILES_PROMO_DAYS = 365;

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
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** dia X do mês seguinte ao base (clamp se mês não tem aquele dia) */
function nextMonthOnDayUTC(base: Date, day: number) {
  const b = startUTC(base);
  const y0 = b.getUTCFullYear();
  const m0 = b.getUTCMonth();

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

    nextRenewalAt = nextMonthOnDayUTC(base, renewalDay);
    inactiveAt = addDaysUTC(nextRenewalAt, 1);

    const cancelAfter =
      program === "LATAM"
        ? LATAM_CANCEL_AFTER_INACTIVE_DAYS
        : SMILES_CANCEL_AFTER_INACTIVE_DAYS;

    pointsExpireAt = addDaysUTC(inactiveAt, cancelAfter);

    if (program === "SMILES") {
      const promoBase = input.smilesPromoBaseAt ?? subscribedAt;
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

function clampTierK(n: number) {
  return Math.min(20, Math.max(1, n));
}

function clampRenewalDay(n: number) {
  return Math.min(31, Math.max(1, n));
}

function applyAutoDowngrade(params: {
  now: Date;
  program: Program;
  currentStatus: Status;
  inactiveAt: Date | null;
  cancelAtOrInativaAt: Date | null; // pointsExpireAt
}) {
  const now = startUTC(params.now);
  const { program, currentStatus, inactiveAt, cancelAtOrInativaAt } = params;

  let s: Status = currentStatus;

  confirms: if (s !== "CANCELED") {
    if ((program === "LATAM" || program === "SMILES") && cancelAtOrInativaAt) {
      if (now >= startUTC(cancelAtOrInativaAt)) s = "CANCELED";
    }

    if (inactiveAt && now >= startUTC(inactiveAt) && s === "ACTIVE") {
      s = "PAUSED";
    }

    if (program === "LIVELO" && inactiveAt && now >= startUTC(inactiveAt) && s === "ACTIVE") {
      s = "PAUSED";
    }
  }

  return s;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { id } = await ctx.params;

  try {
    const existing = await prisma.clubSubscription.findFirst({
      where: { id, team: session.team },
      select: {
        id: true,
        team: true,
        program: true,
        cedenteId: true,
        subscribedAt: true,
        renewalDay: true,
        lastRenewedAt: true,
        tierK: true,
        status: true,
        renewedThisCycle: true,
        notes: true,
      },
    });
    if (!existing) return bad("Clube não encontrado", 404);

    const body = await req.json().catch(() => null);
    if (!body) return bad("JSON inválido");

    const data: any = {};

    // cedente
    if (body.cedenteId !== undefined) {
      const cedenteId = String(body.cedenteId || "").trim();
      if (!cedenteId) return bad("cedenteId inválido");

      const ced = await prisma.cedente.findFirst({
        where: { id: cedenteId, owner: { team: session.team } },
        select: { id: true },
      });
      if (!ced) return bad("Cedente inválido (fora do seu time)", 400);

      data.cedenteId = cedenteId;
    }

    // program
    if (body.program !== undefined) {
      const program = normalizeProgram(body.program);
      if (!program) return bad("program inválido");
      data.program = program;
    }

    // tierK (1..20)
    if (body.tierK !== undefined) {
      const raw = toInt(body.tierK, Number(existing.tierK) || 10) ?? 10;
      if (raw < 0) return bad("tierK não pode ser negativo");
      data.tierK = clampTierK(raw);
    }

    // preço sempre 0
    data.priceCents = 0;

    // subscribedAt (normaliza UTC)
    if (body.subscribedAt !== undefined) {
      const d = toDate(body.subscribedAt);
      if (!d) return bad("subscribedAt inválido");
      data.subscribedAt = startUTC(d);
    }

    // renewalDay (1..31)
    if (body.renewalDay !== undefined) {
      const renewalDay = clampRenewalDay(toInt(body.renewalDay, 1) ?? 1);
      data.renewalDay = renewalDay;
    }

    // lastRenewedAt (pode ser null) — normaliza UTC
    if (body.lastRenewedAt !== undefined) {
      const d = toDate(body.lastRenewedAt);
      data.lastRenewedAt = d ? startUTC(d) : null;
    }

    // renewedThisCycle (mantém, mas NÃO influencia promo)
    if (body.renewedThisCycle !== undefined) {
      data.renewedThisCycle = Boolean(body.renewedThisCycle);
    }

    // status
    if (body.status !== undefined) {
      const status = normalizeStatus(body.status);
      if (!status) return bad("status inválido");
      data.status = status;
    }

    // notes
    if (body.notes !== undefined) {
      const notes =
        body.notes !== null && body.notes !== undefined && String(body.notes).trim()
          ? String(body.notes).trim().slice(0, 500)
          : null;
      data.notes = notes;
    }

    // ==========================
    // Recalcula automações
    // ==========================
    const finalCedenteId: string = (data.cedenteId as string) ?? existing.cedenteId;
    const finalProgram: Program = (data.program as Program) ?? (existing.program as Program);

    const finalSubscribedAt: Date = startUTC(
      ((data.subscribedAt as Date) ?? (existing.subscribedAt as Date)) as Date
    );

    const finalRenewalDay: number = clampRenewalDay(
      Number((data.renewalDay as number) ?? existing.renewalDay) || 1
    );

    const finalLastRenewedAt: Date | null =
      data.lastRenewedAt !== undefined
        ? (data.lastRenewedAt as Date | null)
        : (existing.lastRenewedAt as Date | null);

    const finalTierK: number = clampTierK(Number((data.tierK as number) ?? existing.tierK) || 10);
    data.tierK = finalTierK;
    data.renewalDay = finalRenewalDay;
    data.subscribedAt = finalSubscribedAt;
    data.lastRenewedAt = finalLastRenewedAt;

    // ✅ SMILES promo: ÚLTIMA assinatura SMILES do cedente (MAX), incluindo este registro
    let promoBaseAt: Date | null = null;
    if (finalProgram === "SMILES") {
      const agg = await prisma.clubSubscription.aggregate({
        where: {
          team: session.team,
          cedenteId: finalCedenteId,
          program: "SMILES" as any,
          NOT: { id }, // pega “outros” e compara com este
        },
        _max: { subscribedAt: true },
      });

      const lastOther = agg._max.subscribedAt ? startUTC(agg._max.subscribedAt) : null;
      promoBaseAt =
        lastOther && lastOther.getTime() > finalSubscribedAt.getTime() ? lastOther : finalSubscribedAt;
    }

    const auto = computeAutoDates({
      program: finalProgram,
      subscribedAt: finalSubscribedAt,
      renewalDay: finalRenewalDay,
      lastRenewedAt: finalLastRenewedAt,
      smilesPromoBaseAt: promoBaseAt,
    });

    data.pointsExpireAt = auto.pointsExpireAt ?? null;
    data.smilesBonusEligibleAt = finalProgram === "SMILES" ? auto.smilesBonusEligibleAt ?? null : null;

    // status downgrade automático (não reativa sozinho)
    const now = startUTC(new Date());
    const currentStatus: Status = (data.status as Status) ?? (existing.status as Status);

    const desiredStatus = applyAutoDowngrade({
      now,
      program: finalProgram,
      currentStatus,
      inactiveAt: auto.inactiveAt,
      cancelAtOrInativaAt: auto.pointsExpireAt,
    });

    data.status = desiredStatus;

    const updated = await prisma.clubSubscription.update({
      where: { id },
      data,
      include: {
        cedente: {
          select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
        },
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { id } = await ctx.params;

  try {
    const { searchParams } = new URL(req.url);
    const hard = searchParams.get("hard") === "1";

    const existing = await prisma.clubSubscription.findFirst({
      where: { id, team: session.team },
      select: { id: true },
    });
    if (!existing) return bad("Clube não encontrado", 404);

    if (hard) {
      await prisma.clubSubscription.delete({ where: { id } });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const updated = await prisma.clubSubscription.update({
      where: { id },
      data: { status: "CANCELED" as any },
      include: {
        cedente: {
          select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
        },
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return bad(prismaMsg(e), 500);
  }
}
