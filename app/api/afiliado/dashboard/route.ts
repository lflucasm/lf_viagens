import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAffiliateSessionServer } from "@/lib/affiliates/session";
import { getAffiliateMetrics } from "@/lib/affiliates/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function GET() {
  try {
    const session = await getAffiliateSessionServer();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: { id: session.id, team: session.team, isActive: true },
      select: {
        id: true,
        team: true,
        name: true,
        login: true,
        document: true,
        flightSalesLink: true,
        pointsPurchaseLink: true,
        commissionBps: true,
        isActive: true,
        updatedAt: true,
      },
    });

    if (!affiliate) {
      return NextResponse.json({ ok: false, error: "Afiliado inativo ou não encontrado." }, { status: 401 });
    }

    const metrics = await getAffiliateMetrics(affiliate, { includeSales: true, saleLimit: 500 });

    return NextResponse.json({
      ok: true,
      data: {
        affiliate,
        metrics,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Erro ao carregar painel do afiliado.") },
      { status: 500 }
    );
  }
}
