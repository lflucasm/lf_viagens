import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound, serverError } from "@/lib/api";
import { recomputeCompra } from "@/lib/compras";
import { getSessionServer } from "@/lib/auth-server";
import { LoyaltyProgram } from "@prisma/client";

export const dynamic = "force-dynamic";

type ClubProgram = LoyaltyProgram;
type ClubMeta = {
  program?: ClubProgram;
  tierK?: number;
  priceCents?: number;
  renewalDay?: number;
  startDateISO?: string;
  bonusPoints?: number;
};

const CLUB_PROGRAMS = new Set<ClubProgram>(["LATAM", "SMILES", "LIVELO", "ESFERA"]);
const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;
const SMILES_CANCEL_AFTER_INACTIVE_DAYS = 60;
const LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS = 30;
const SMILES_PROMO_DAYS = 365;

function safeJsonParse<T>(s?: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
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
    y += 1;
    m = 0;
  }
  const dd = Math.min(Math.max(1, day), daysInMonthUTC(y, m));
  return new Date(Date.UTC(y, m, dd));
}

function clampTierK(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(20, Math.trunc(n)));
}

function clampDay(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(31, Math.trunc(n)));
}

function clampCents(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function parseIsoDate(v?: string | null) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return startUTC(d);
}

function normalizeProgram(v: unknown): ClubProgram | null {
  const s = String(v || "").trim().toUpperCase();
  return CLUB_PROGRAMS.has(s as ClubProgram) ? (s as ClubProgram) : null;
}

function computeAutoDates(input: {
  program: ClubProgram;
  subscribedAt: Date;
  renewalDay: number;
  smilesPromoBaseAt?: Date | null;
}) {
  const { program, subscribedAt, renewalDay } = input;
  let pointsExpireAt: Date | null = null;
  let smilesBonusEligibleAt: Date | null = null;

  if (program === "LATAM" || program === "SMILES") {
    const nextRenewalAt = nextMonthOnDayUTC(subscribedAt, renewalDay);
    const inactiveAt = addDaysUTC(nextRenewalAt, 1);
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
    pointsExpireAt = addDaysUTC(subscribedAt, LIVELO_INACTIVE_AFTER_SUBSCRIBE_DAYS);
  }

  return { pointsExpireAt, smilesBonusEligibleAt };
}

/**
 * Body opcional:
 * {
 *   saldosAplicados?: { latam?: number, smiles?: number, livelo?: number, esfera?: number }
 * }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id) return badRequest("id é obrigatório.");

    // ✅ sessão vem do cookie (server)
    const session = await getSessionServer();
    const userId = String(session?.id || "");
    if (!userId) return badRequest("Sessão inválida: faça login novamente.");
    const team = String(session?.team || "");
    if (!team) return badRequest("Sessão inválida (time não encontrado).");

    // body pode ser vazio
    const body = await req.json().catch(() => ({} as any));

    // 1) valida compra
    const compraBase = await prisma.purchase.findUnique({
      where: { id },
      include: { cedente: true },
    });
    if (!compraBase) return notFound("Compra não encontrada.");
    if (compraBase.status !== "OPEN") {
      return badRequest("Só pode liberar compra OPEN.");
    }

    // 2) recompute antes de aplicar
    await recomputeCompra(id);

    // 3) recarrega (garante valores atualizados)
    const compra = await prisma.purchase.findUnique({
      where: { id },
      include: { cedente: true },
    });
    if (!compra) return notFound("Compra não encontrada (pós-recompute).");
    if (compra.status !== "OPEN") {
      return badRequest("Só pode liberar compra OPEN.");
    }
    if (!compra.cedente) return badRequest("Cedente não encontrado na compra.");

    // 4) define saldos aplicados (preferência: body > saldoPrevisto* > saldo atual)
    const applied = {
      latam: clampPts(
        body?.saldosAplicados?.latam ??
          compra.saldoPrevistoLatam ??
          compra.cedente.pontosLatam ??
          0
      ),
      smiles: clampPts(
        body?.saldosAplicados?.smiles ??
          compra.saldoPrevistoSmiles ??
          compra.cedente.pontosSmiles ??
          0
      ),
      livelo: clampPts(
        body?.saldosAplicados?.livelo ??
          compra.saldoPrevistoLivelo ??
          compra.cedente.pontosLivelo ??
          0
      ),
      esfera: clampPts(
        body?.saldosAplicados?.esfera ??
          compra.saldoPrevistoEsfera ??
          compra.cedente.pontosEsfera ??
          0
      ),
    };

    // 5) transação: aplica saldo no cedente + fecha compra + libera itens + gera comissão
    const result = await prisma.$transaction(async (tx) => {
      const stillOpen = await tx.purchase.findUnique({
        where: { id },
        include: { cedente: true },
      });

      if (!stillOpen) throw new Error("Compra não encontrada.");
      if (stillOpen.status !== "OPEN") {
        throw new Error("Compra já não está OPEN (possível dupla liberação).");
      }
      if (!stillOpen.cedente) throw new Error("Cedente não encontrado na compra.");

      // aplica saldos no cedente
      await tx.cedente.update({
        where: { id: stillOpen.cedenteId },
        data: {
          pontosLatam: applied.latam,
          pontosSmiles: applied.smiles,
          pontosLivelo: applied.livelo,
          pontosEsfera: applied.esfera,
        },
      });

      // libera itens pendentes
      await tx.purchaseItem.updateMany({
        where: { purchaseId: id, status: "PENDING" },
        data: { status: "RELEASED" },
      });

      // fecha compra + registra saldos aplicados + auditoria
      const closedPurchase = await tx.purchase.update({
        where: { id },
        data: {
          liberadoEm: new Date(),
          liberadoPorId: userId,
          status: "CLOSED",

          saldoAplicadoLatam: applied.latam,
          saldoAplicadoSmiles: applied.smiles,
          saldoAplicadoLivelo: applied.livelo,
          saldoAplicadoEsfera: applied.esfera,
        },
        include: { items: true, cedente: true, liberadoPor: true },
      });

      // gera/atualiza comissão do cedente (se tiver valor)
      let commission: any = null;
      const amountCents = Number(closedPurchase.cedentePayCents || 0);

      if (amountCents > 0) {
        commission = await tx.cedenteCommission.upsert({
          where: { purchaseId: closedPurchase.id },
          create: {
            cedenteId: closedPurchase.cedenteId,
            purchaseId: closedPurchase.id,
            amountCents,
            status: "PENDING",
            generatedById: userId,
            // generatedAt default(now())
          },
          update: {
            amountCents,
            status: "PENDING",
            generatedById: userId,
            // (opcional) se quiser “regerar” data:
            // generatedAt: new Date(),
            paidAt: null,
            paidById: null,
          },
        });
      }

      // cria assinatura(s) de clube automaticamente a partir dos itens CLUB
      let clubsLinked = 0;
      const clubItems = (closedPurchase.items || []).filter((it: any) => it.type === "CLUB");

      for (const it of clubItems) {
        if (!it?.id) continue;

        const meta = safeJsonParse<ClubMeta>(it.details);
        const program =
          normalizeProgram(meta?.program) ||
          normalizeProgram(it.programTo) ||
          null;
        if (!program) continue;

        const tierK = clampTierK(meta?.tierK ?? Math.round((Number(it.pointsBase || 0) || 0) / 1000));
        const priceCents = clampCents(meta?.priceCents ?? it.amountCents);
        const renewalDay = clampDay(meta?.renewalDay);
        const subscribedAt = parseIsoDate(meta?.startDateISO) || startUTC(new Date());
        const bonusPoints = clampPts(meta?.bonusPoints ?? (it.bonusMode === "TOTAL" ? it.bonusValue : 0));

        let smilesPromoBaseAt: Date | null = null;
        if (program === "SMILES") {
          const agg = await tx.clubSubscription.aggregate({
            where: { team, cedenteId: closedPurchase.cedenteId, program: "SMILES" as any },
            _max: { subscribedAt: true },
          });
          const last = agg._max.subscribedAt ? startUTC(agg._max.subscribedAt) : null;
          smilesPromoBaseAt = last && last.getTime() > subscribedAt.getTime() ? last : subscribedAt;
        }

        const auto = computeAutoDates({
          program,
          subscribedAt,
          renewalDay,
          smilesPromoBaseAt,
        });

        const noteParts = [`Gerado automaticamente da compra ${closedPurchase.numero}.`];
        if (bonusPoints > 0) noteParts.push(`Bônus aplicado: ${bonusPoints.toLocaleString("pt-BR")} milhas.`);

        await tx.clubSubscription.upsert({
          where: { sourcePurchaseItemId: it.id },
          create: {
            team,
            cedenteId: closedPurchase.cedenteId,
            program: program as any,
            tierK,
            priceCents,
            subscribedAt,
            renewalDay,
            lastRenewedAt: null,
            pointsExpireAt: auto.pointsExpireAt,
            renewedThisCycle: false,
            status: "ACTIVE",
            smilesBonusEligibleAt: auto.smilesBonusEligibleAt,
            notes: noteParts.join(" "),
            sourcePurchaseItemId: it.id,
          },
          update: {
            team,
            cedenteId: closedPurchase.cedenteId,
            program: program as any,
            tierK,
            priceCents,
            subscribedAt,
            renewalDay,
            pointsExpireAt: auto.pointsExpireAt,
            status: "ACTIVE",
            smilesBonusEligibleAt: auto.smilesBonusEligibleAt,
            notes: noteParts.join(" "),
          },
        });

        clubsLinked += 1;
      }

      return { compra: closedPurchase, commission, clubsLinked };
    });

    return ok(result);
  } catch (e: any) {
    return serverError("Falha ao liberar compra.", { detail: e?.message });
  }
}

function clampPts(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}
