import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isYYYYMM(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

type Breakdown = {
  commission1Cents?: number;
  commission2Cents?: number;
  commission3RateioCents?: number;
  salesCount?: number;
  taxPercent?: number;
};

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    const role = String((sess as any)?.role || ""); // "admin" | "staff"

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const userId = String(url.searchParams.get("userId") || "").trim();
    const monthRaw = String(url.searchParams.get("month") || "").trim();

    if (!userId || !monthRaw) {
      return NextResponse.json(
        { ok: false, error: "userId e month obrigatórios (YYYY-MM)" },
        { status: 400 }
      );
    }

    const month = monthRaw.slice(0, 7);
    if (!isYYYYMM(month)) {
      return NextResponse.json({ ok: false, error: "month inválido. Use YYYY-MM" }, { status: 400 });
    }

    // ✅ permissão: staff só pode ver a si mesmo
    if (role !== "admin" && userId !== meId) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    // (opcional, mas bom) garante que o userId existe no time
    const user = await prisma.user.findFirst({
      where: { id: userId, team, role: { in: ["admin", "staff"] } },
      select: { id: true, name: true, login: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado no time." }, { status: 404 });
    }

    const days = await prisma.employeePayout.findMany({
      where: { team, userId, date: { startsWith: `${month}-` } },
      orderBy: { date: "desc" },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    const totals = days.reduce(
      (acc, r) => {
        acc.gross += r.grossProfitCents || 0;
        acc.tax += r.tax7Cents || 0;
        acc.fee += r.feeCents || 0;
        acc.net += r.netPayCents || 0;

        if (r.paidById) acc.paid += r.netPayCents || 0;
        else acc.pending += r.netPayCents || 0;

        return acc;
      },
      { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 }
    );

    // ✅ Totais por comissão (lendo do breakdown)
    const totalsBreakdown = days.reduce(
      (acc, r) => {
        const b = (r.breakdown || {}) as Breakdown;

        acc.commission1Cents += safeInt(b.commission1Cents);
        acc.commission2Cents += safeInt(b.commission2Cents);
        acc.commission3RateioCents += safeInt(b.commission3RateioCents);
        acc.salesCount += safeInt(b.salesCount);

        return acc;
      },
      {
        commission1Cents: 0,
        commission2Cents: 0,
        commission3RateioCents: 0,
        salesCount: 0,
      }
    );

    // ✅ normaliza retorno (datas em ISO, breakdown sempre objeto)
    const outDays = days.map((r) => ({
      id: r.id,
      team: r.team,
      date: r.date,
      userId: r.userId,

      grossProfitCents: r.grossProfitCents,
      tax7Cents: r.tax7Cents,
      feeCents: r.feeCents,
      netPayCents: r.netPayCents,

      breakdown: ((r.breakdown as any) || null) as any,

      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      paidById: r.paidById ?? null,

      user: r.user,
      paidBy: r.paidBy ?? null,

      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      userId,
      month,
      totals,
      totalsBreakdown,
      days: outDays,
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
