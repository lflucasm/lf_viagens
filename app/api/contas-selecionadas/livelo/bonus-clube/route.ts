import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  return NextResponse.json(
    { ok: false, error },
    { status, headers: noCacheHeaders() }
  );
}

function toInt(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

function clampRenewalDay(v: number) {
  return Math.min(31, Math.max(1, v));
}

function clampBonusPoints(v: number) {
  return Math.max(0, v);
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const includeCanceled = url.searchParams.get("includeCanceled") !== "0";

    const statusIn = includeCanceled
      ? (["ACTIVE", "PAUSED", "CANCELED"] as const)
      : (["ACTIVE", "PAUSED"] as const);

    const rows = await prisma.clubSubscription.findMany({
      where: {
        team: session.team,
        program: "LIVELO",
        status: { in: statusIn as any },
      },
      distinct: ["cedenteId"],
      orderBy: [{ cedenteId: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        cedenteId: true,
        status: true,
        tierK: true,
        renewalDay: true,
        monthlyBonusPoints: true,
        subscribedAt: true,
        lastRenewedAt: true,
        updatedAt: true,
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            owner: {
              select: {
                id: true,
                name: true,
                login: true,
              },
            },
          },
        },
      },
    });

    const items = [...rows].sort((a, b) =>
      a.cedente.nomeCompleto.localeCompare(b.cedente.nomeCompleto, "pt-BR")
    );

    return NextResponse.json(
      { ok: true, items },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao carregar bônus clube Livelo.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const id = String(body?.id || "").trim();

    if (!id) return bad("id é obrigatório.");

    const existing = await prisma.clubSubscription.findFirst({
      where: {
        id,
        team: session.team,
        program: "LIVELO",
      },
      select: { id: true },
    });

    if (!existing) {
      return bad("Clube Livelo não encontrado.", 404);
    }

    const data: {
      renewalDay?: number;
      monthlyBonusPoints?: number;
    } = {};

    if (body?.renewalDay !== undefined) {
      const renewalDayRaw = toInt(body.renewalDay);
      if (!Number.isFinite(renewalDayRaw)) {
        return bad("Dia de renovação inválido.");
      }
      data.renewalDay = clampRenewalDay(renewalDayRaw);
    }

    if (body?.monthlyBonusPoints !== undefined) {
      const monthlyBonusPointsRaw = toInt(body.monthlyBonusPoints);
      if (!Number.isFinite(monthlyBonusPointsRaw)) {
        return bad("Bônus mensal inválido.");
      }
      data.monthlyBonusPoints = clampBonusPoints(monthlyBonusPointsRaw);
    }

    if (data.renewalDay == null && data.monthlyBonusPoints == null) {
      return bad("Nenhuma alteração informada.");
    }

    const item = await prisma.clubSubscription.update({
      where: { id: existing.id },
      data,
      select: {
        id: true,
        cedenteId: true,
        status: true,
        tierK: true,
        renewalDay: true,
        monthlyBonusPoints: true,
        subscribedAt: true,
        lastRenewedAt: true,
        updatedAt: true,
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            owner: {
              select: {
                id: true,
                name: true,
                login: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      { ok: true, item },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao salvar bônus clube Livelo.", 500);
  }
}
