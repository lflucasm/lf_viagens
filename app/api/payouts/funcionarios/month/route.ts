import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  BalcaoTaxRule,
  balcaoProfitSemTaxaCents,
  buildTaxRule,
  recifeDateISO,
  resolveTaxPercent,
  sellerCommissionCentsFromNet,
  taxFromProfitCents,
  netProfitAfterTaxCents,
} from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as { team?: unknown })?.team || "");
    const meId = String((sess as { id?: unknown })?.id || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const userId = String(url.searchParams.get("userId") || "");
    const month = String(url.searchParams.get("month") || "");

    if (!userId || !month) {
      return NextResponse.json(
        { ok: false, error: "userId e month obrigatórios (YYYY-MM)" },
        { status: 400 }
      );
    }

    const m = month.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) {
      return NextResponse.json({ ok: false, error: "month inválido. Use YYYY-MM" }, { status: 400 });
    }

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });
    const taxRule: BalcaoTaxRule = buildTaxRule(settings);

    const startRecife = new Date(`${m}-01T00:00:00-03:00`);
    const endRecife = new Date(`${m}-01T00:00:00-03:00`);
    endRecife.setMonth(endRecife.getMonth() + 1);

    const balcaoOps = await prisma.balcaoOperacao.findMany({
      where: {
        team,
        employeeId: userId,
        createdAt: { gte: startRecife, lt: endRecife },
      },
      select: {
        createdAt: true,
        customerChargeCents: true,
        supplierPayCents: true,
        boardingFeeCents: true,
      },
    });

    const balcaoByDate = new Map<string, number>();
    for (const op of balcaoOps) {
      const dateISO = recifeDateISO(op.createdAt);
      const percent = resolveTaxPercent(dateISO, taxRule);
      const profitCents = balcaoProfitSemTaxaCents({
        customerChargeCents: op.customerChargeCents,
        supplierPayCents: op.supplierPayCents,
        boardingFeeCents: op.boardingFeeCents,
      });
      const taxCents = taxFromProfitCents(profitCents, percent);
      const netCents = netProfitAfterTaxCents(profitCents, taxCents);
      const commissionCents = sellerCommissionCentsFromNet(netCents);
      balcaoByDate.set(dateISO, (balcaoByDate.get(dateISO) || 0) + commissionCents);
    }

    const dbDays = await prisma.employeePayout.findMany({
      where: { team, userId, date: { startsWith: `${m}-` } },
      orderBy: { date: "desc" },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    const days = dbDays.map((d) => ({
      ...d,
      balcaoCommissionCents: balcaoByDate.get(d.date) || 0,
    }));

    const totals = days.reduce(
      (acc, r) => {
        acc.gross += r.grossProfitCents || 0;
        acc.tax += r.tax7Cents || 0;
        acc.fee += r.feeCents || 0;
        acc.net += r.netPayCents || 0;
        acc.balcaoCommission += r.balcaoCommissionCents || 0;
        if (r.paidById) acc.paid += r.netPayCents || 0;
        else acc.pending += r.netPayCents || 0;
        return acc;
      },
      { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0, balcaoCommission: 0 }
    );

    return NextResponse.json({ ok: true, userId, month: m, totals, days });
  } catch (e: unknown) {
    const message = e instanceof Error && e.message ? e.message : String(e);
    const msg = message === "UNAUTHENTICATED" ? "Não autenticado" : message;
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
