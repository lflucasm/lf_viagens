import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { triggerEmployeePayoutAutoCompute, todayISORecife } from "@/lib/payouts/autoCompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}
function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}
async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const purchaseId = String(body.purchaseId || "").trim();
  if (!purchaseId) {
    return NextResponse.json({ ok: false, error: "purchaseId obrigatório" }, { status: 400 });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          numero: true,
          status: true,
          pontosCiaTotal: true, // ✅ era points
          totalCents: true,
          metaMilheiroCents: true,
          finalizedAt: true,
          cedente: { select: { owner: { select: { team: true } } } },
        },
      });

      if (!purchase) throw new Error("Compra não encontrada.");
      if (purchase.cedente?.owner?.team !== session.team) throw new Error("Sem permissão.");
      if (purchase.status !== "CLOSED") throw new Error("Compra não está LIBERADA.");
      if (purchase.finalizedAt) throw new Error("Compra já foi finalizada.");

      const agg = await tx.sale.aggregate({
        where: { purchaseId, paymentStatus: { not: "CANCELED" } },
        _sum: { points: true, passengers: true, totalCents: true, pointsValueCents: true },
      });

      const soldPoints = agg._sum.points ?? 0;
      const pax = agg._sum.passengers ?? 0;
      const salesTotalCents = agg._sum.totalCents ?? 0;
      const pointsValueCents = agg._sum.pointsValueCents ?? 0;

      const avgMilheiroCents =
        soldPoints > 0 ? Math.round((pointsValueCents * 1000) / soldPoints) : 0;

      const profitCents = salesTotalCents - (purchase.totalCents || 0);

      const finalizedAt = new Date();

      const updated = await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          finalizedAt,
          finalizedById: session.id,
          finalSalesCents: salesTotalCents,
          finalProfitCents: profitCents,
          finalSoldPoints: soldPoints,
          finalPax: pax,
          finalAvgMilheiroCents: avgMilheiroCents,
        },
        select: {
          id: true,
          numero: true,
          finalizedAt: true,
          finalProfitCents: true,
          finalSalesCents: true,
          finalSoldPoints: true,
          finalPax: true,
          finalAvgMilheiroCents: true,
        },
      });

      return updated;
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoCompute(req, {
      team: session.team,
      date: todayISORecife(),
      fallbackBasis: "PURCHASE_FINALIZED",
    });

    return NextResponse.json({ ok: true, purchase: out, payoutAutoCompute });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e, "Erro ao finalizar") },
      { status: 400 }
    );
  }
}
