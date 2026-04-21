import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  balcaoProfitSemTaxaCents,
  buildTaxRule,
  netProfitAfterTaxCents,
  recifeDateISO,
  resolveTaxPercent,
  sellerCommissionCentsFromNet,
  taxFromProfitCents,
} from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test((v || "").trim());
}

export async function GET() {
  try {
    const sess = await requireSession();
    const team = String((sess as { team?: unknown })?.team || "");
    const meId = String((sess as { id?: unknown })?.id || "");
    const role = String((sess as { role?: unknown })?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const [users, payouts, settings] = await Promise.all([
      prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.employeePayout.findMany({
        where: { team },
        select: {
          userId: true,
          date: true,
          grossProfitCents: true,
          tax7Cents: true,
        },
      }),
      prisma.settings.upsert({
        where: { key: "default" },
        create: { key: "default" },
        update: {},
        select: { taxPercent: true, taxEffectiveFrom: true },
      }),
    ]);

    const balcaoOps = await prisma.balcaoOperacao.findMany({
      where: {
        team,
        employeeId: { not: null },
      },
      select: {
        employeeId: true,
        createdAt: true,
        customerChargeCents: true,
        supplierPayCents: true,
        boardingFeeCents: true,
      },
    });

    const taxRule = buildTaxRule(settings);
    const monthsSet = new Set<string>();
    const byUserMonth: Record<
      string,
      Record<
        string,
        {
          payoutNetNoFee: number;
          balcaoCommission: number;
        }
      >
    > = {};

    function ensure(userId: string, month: string) {
      const byMonth = (byUserMonth[userId] ||= {});
      return (byMonth[month] ||= {
        payoutNetNoFee: 0,
        balcaoCommission: 0,
      });
    }

    for (const p of payouts) {
      const month = String(p.date || "").slice(0, 7);
      if (!isMonthISO(month)) continue;
      const bucket = ensure(p.userId, month);
      bucket.payoutNetNoFee += safeInt(p.grossProfitCents, 0) - safeInt(p.tax7Cents, 0);
      monthsSet.add(month);
    }

    for (const op of balcaoOps) {
      const userId = String(op.employeeId || "").trim();
      if (!userId) continue;

      const month = recifeDateISO(op.createdAt).slice(0, 7);
      if (!isMonthISO(month)) continue;

      const opDateISO = recifeDateISO(op.createdAt);
      const taxPercent = resolveTaxPercent(opDateISO, taxRule);
      const opGross = safeInt(
        balcaoProfitSemTaxaCents({
          customerChargeCents: op.customerChargeCents,
          supplierPayCents: op.supplierPayCents,
          boardingFeeCents: op.boardingFeeCents,
        }),
        0
      );
      const opTax = safeInt(taxFromProfitCents(opGross, taxPercent), 0);
      const opNetNoFee = safeInt(netProfitAfterTaxCents(opGross, opTax), 0);
      const opCommission = safeInt(sellerCommissionCentsFromNet(opNetNoFee), 0);

      const bucket = ensure(userId, month);
      bucket.balcaoCommission += opCommission;
      monthsSet.add(month);
    }

    const months = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));

    const series = users
      .map((u) => ({
        user: { id: u.id, name: u.name, login: u.login, role: u.role },
        points: months.map((month) => {
          const bucket = byUserMonth[u.id]?.[month];
          return {
            month,
            netNoFeeCents: safeInt(bucket?.payoutNetNoFee, 0) + safeInt(bucket?.balcaoCommission, 0),
          };
        }),
      }))
      .filter((row) => row.points.some((p) => p.netNoFeeCents !== 0));

    return NextResponse.json({
      ok: true,
      months,
      series,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message ? e.message : "Erro interno";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
