import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  computeVipRateioDistribution,
  normalizeEmployeeShares,
  payoutDatesForReferenceMonth,
  resolveMonthRef,
  toRateioSetting,
} from "@/lib/vip-rateio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const month = String(url.searchParams.get("month") || "").trim();
    const monthResolved = resolveMonthRef(month);

    const settingRow = await prisma.vipWhatsappRateioSetting.upsert({
      where: { team },
      create: { team },
      update: {},
      select: {
        ownerPercentBps: true,
        othersPercentBps: true,
        taxPercentBps: true,
        payoutDaysCsv: true,
      },
    });
    const setting = toRateioSetting(settingRow);

    const [employees, leads, payments, sharesRows] = await Promise.all([
      prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true },
        orderBy: { name: "asc" },
      }),
      prisma.vipWhatsappLead.findMany({
        where: { team },
        select: { employeeId: true, status: true },
      }),
      prisma.vipWhatsappPayment.findMany({
        where: {
          team,
          paidAt: { gte: monthResolved.start, lt: monthResolved.nextStart },
        },
        select: {
          amountCents: true,
          lead: { select: { employeeId: true } },
        },
      }),
      prisma.vipWhatsappRateioShare.findMany({
        where: { team },
        select: { employeeId: true, shareBps: true },
      }),
    ]);

    const sharesMap = normalizeEmployeeShares(
      employees.map((employee) => employee.id),
      new Map(sharesRows.map((share) => [share.employeeId, share.shareBps]))
    );

    const totalClientsByEmployee = new Map<string, number>();
    const approvedClientsByEmployee = new Map<string, number>();
    for (const lead of leads) {
      totalClientsByEmployee.set(
        lead.employeeId,
        (totalClientsByEmployee.get(lead.employeeId) || 0) + 1
      );
      if (lead.status === "APPROVED") {
        approvedClientsByEmployee.set(
          lead.employeeId,
          (approvedClientsByEmployee.get(lead.employeeId) || 0) + 1
        );
      }
    }

    const distribution = computeVipRateioDistribution({
      payments: payments.map((payment) => ({
        amountCents: payment.amountCents,
        responsibleEmployeeId: payment.lead.employeeId,
      })),
      employeeIds: employees.map((employee) => employee.id),
      setting,
      othersShareByEmployeeId: sharesMap,
    });

    const rows = employees
      .map((employee) => {
        const clientsTotal = totalClientsByEmployee.get(employee.id) || 0;
        const clientsApproved = approvedClientsByEmployee.get(employee.id) || 0;
        const ownPaidCents = distribution.ownPaidByEmployeeId.get(employee.id) || 0;
        const earningCents =
          distribution.earningsByEmployeeId.get(employee.id) || 0;

        return {
          employee: {
            id: employee.id,
            name: employee.name,
            login: employee.login,
          },
          clientsTotal,
          clientsApproved,
          ownPaidCents,
          earningCents,
          othersSharePercent: (sharesMap.get(employee.id) || 0) / 100,
        };
      })
      .sort((a, b) => b.earningCents - a.earningCents);

    const payoutDates = payoutDatesForReferenceMonth(
      monthResolved.monthRef,
      setting.payoutDays
    ).map((date) => date.toISOString());

    return NextResponse.json({
      ok: true,
      data: {
        monthRef: monthResolved.monthRef,
        payoutDates,
        setting: {
          ownerPercent: setting.ownerPercentBps / 100,
          othersPercent: setting.othersPercentBps / 100,
          taxPercent: setting.taxPercentBps / 100,
          payoutDays: setting.payoutDays,
        },
        totals: distribution.totals,
        rows,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao carregar clientes do Grupo VIP.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
