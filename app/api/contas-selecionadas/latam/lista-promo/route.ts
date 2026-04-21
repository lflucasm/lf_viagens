import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { LoyaltyProgram } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PromoStatus = "PENDING" | "ELIGIBLE" | "DENIED" | "USED";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
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

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function normalizeStatus(v: unknown): PromoStatus | null {
  const s = String(v || "").trim().toUpperCase();
  if (s === "PENDING" || s === "ELIGIBLE" || s === "DENIED" || s === "USED") return s;
  return null;
}

function boundsLast365UTC() {
  const now = new Date();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  start.setUTCHours(0, 0, 0, 0);

  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const listDateRaw = (searchParams.get("date") || "").trim();
    const listDate = isISODate(listDateRaw) ? listDateRaw : isoDateNowSP();

    const [items, recentDateRows] = await Promise.all([
      prisma.latamPromoListItem.findMany({
        where: {
          team: session.team,
          listDate,
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          listDate: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          usedAt: true,
          cedente: {
            select: {
              id: true,
              identificador: true,
              nomeCompleto: true,
              cpf: true,
              telefone: true,
              pontosLatam: true,
              pontosLivelo: true,
              owner: { select: { id: true, name: true, login: true } },
              latamTurboAccount: {
                select: {
                  cpfLimit: true,
                  cpfUsed: true,
                },
              },
              score: {
                select: {
                  rapidezBiometria: true,
                  rapidezSms: true,
                  resolucaoProblema: true,
                  confianca: true,
                },
              },
            },
          },
          addedBy: { select: { id: true, name: true, login: true } },
          reviewedBy: { select: { id: true, name: true, login: true } },
        },
      }),
      prisma.latamPromoListItem.findMany({
        where: { team: session.team },
        distinct: ["listDate"],
        orderBy: [{ listDate: "desc" }],
        take: 14,
        select: { listDate: true },
      }),
    ]);

    const cedenteIds = items.map((item) => item.cedente.id);
    const { start: yStart, end: yEnd } = boundsLast365UTC();

    const usedAgg = cedenteIds.length
      ? await prisma.emissionEvent.groupBy({
          by: ["cedenteId"],
          where: {
            program: LoyaltyProgram.LATAM,
            issuedAt: { gte: yStart, lte: yEnd },
            cedenteId: { in: cedenteIds },
          },
          _sum: { passengersCount: true },
        })
      : [];

    const usedCalcByCedente = new Map<string, number>(
      usedAgg.map((x) => [x.cedenteId, Number(x._sum.passengersCount || 0)])
    );

    const rows = items.map((item) => {
      const score = item.cedente.score;
      const avg = score
        ? (Number(score.rapidezBiometria || 0) +
            Number(score.rapidezSms || 0) +
            Number(score.resolucaoProblema || 0) +
            Number(score.confianca || 0)) /
          4
        : 0;
      const paxLimit = Number(item.cedente.latamTurboAccount?.cpfLimit || 25);
      const usedCalc = Number(usedCalcByCedente.get(item.cedente.id) || 0);
      const usedManual = Number(item.cedente.latamTurboAccount?.cpfUsed || 0);
      const paxUsed = Math.max(usedCalc, usedManual);

      return {
        id: item.id,
        listDate: item.listDate,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        resolvedAt: item.resolvedAt,
        usedAt: item.usedAt,
        scoreMedia: Math.round(avg * 100) / 100,
        cedente: {
          ...item.cedente,
          paxDisponivel: Math.max(0, paxLimit - paxUsed),
        },
        addedBy: item.addedBy,
        reviewedBy: item.reviewedBy,
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "PENDING") acc.pending += 1;
        if (row.status === "ELIGIBLE") acc.eligible += 1;
        if (row.status === "DENIED") acc.denied += 1;
        if (row.status === "USED") acc.used += 1;
        return acc;
      },
      { total: 0, pending: 0, eligible: 0, denied: 0, used: 0 }
    );

    return NextResponse.json({
      ok: true,
      listDate,
      today: isoDateNowSP(),
      recentDates: recentDateRows.map((row) => row.listDate),
      summary,
      groups: {
        eligible: rows.filter((row) => row.status === "ELIGIBLE"),
        pending: rows.filter((row) => row.status === "PENDING"),
        denied: rows.filter((row) => row.status === "DENIED"),
        used: rows.filter((row) => row.status === "USED"),
      },
    });
  } catch (e: any) {
    return bad(e?.message || "Erro ao carregar lista promo.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const cedenteId = String(body?.cedenteId || "").trim();
    const listDateRaw = String(body?.listDate || "").trim();
    const listDate = isISODate(listDateRaw) ? listDateRaw : isoDateNowSP();

    if (!cedenteId) return bad("cedenteId é obrigatório");

    const cedente = await prisma.cedente.findFirst({
      where: {
        id: cedenteId,
        owner: { team: session.team },
      },
      select: { id: true, nomeCompleto: true },
    });

    if (!cedente) return bad("Cedente não encontrado.", 404);

    const existing = await prisma.latamPromoListItem.findUnique({
      where: {
        team_listDate_cedenteId: {
          team: session.team,
          listDate,
          cedenteId,
        },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        itemId: existing.id,
        status: existing.status,
        listDate,
      });
    }

    const item = await prisma.latamPromoListItem.create({
      data: {
        team: session.team,
        listDate,
        cedenteId,
        status: "PENDING",
        addedById: session.id,
      },
      select: { id: true, status: true, listDate: true },
    });

    return NextResponse.json({
      ok: true,
      created: true,
      itemId: item.id,
      status: item.status,
      listDate: item.listDate,
    });
  } catch (e: any) {
    return bad(e?.message || "Erro ao adicionar na lista promo.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const itemId = String(body?.itemId || "").trim();
    const status = normalizeStatus(body?.status);

    if (!itemId) return bad("itemId é obrigatório");
    if (!status) return bad("status inválido");

    const existing = await prisma.latamPromoListItem.findFirst({
      where: {
        id: itemId,
        team: session.team,
      },
      select: { id: true },
    });

    if (!existing) return bad("Item não encontrado.", 404);

    const now = new Date();
    const data: Record<string, any> = {
      status,
      reviewedById: session.id,
    };

    if (status === "PENDING") {
      data.resolvedAt = null;
      data.usedAt = null;
      data.reviewedById = null;
    } else if (status === "USED") {
      data.resolvedAt = now;
      data.usedAt = now;
    } else {
      data.resolvedAt = now;
      data.usedAt = null;
    }

    const item = await prisma.latamPromoListItem.update({
      where: { id: itemId },
      data,
      select: {
        id: true,
        status: true,
        resolvedAt: true,
        usedAt: true,
      },
    });

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return bad(e?.message || "Erro ao atualizar item da lista promo.", 500);
  }
}
