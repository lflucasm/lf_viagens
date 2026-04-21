import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  clampInt,
  normalizeEmployeeShares,
  parsePayoutDaysCsv,
  payoutDatesForReferenceMonth,
  payoutDaysToCsv,
  resolveMonthRef,
  toRateioSetting,
} from "@/lib/vip-rateio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePercentToBps(input: unknown, fallbackBps: number) {
  if (input === null || input === undefined || input === "") return fallbackBps;

  if (typeof input === "number" && Number.isFinite(input)) {
    return clampInt(Math.round(input * 100), 0, 10000);
  }

  const raw = String(input).trim();
  if (!raw) return fallbackBps;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return fallbackBps;
  return clampInt(Math.round(value * 100), 0, 10000);
}

function parseDaysInput(input: unknown) {
  if (Array.isArray(input)) {
    return parsePayoutDaysCsv(input.join(","));
  }
  return parsePayoutDaysCsv(String(input ?? ""));
}

function parseEmployeeShares(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const source = raw as Record<string, unknown>;
      const employeeId = String(source.employeeId || "").trim();
      if (!employeeId) return null;

      const percent = source.percent;
      const percentBps = parsePercentToBps(percent, 0);

      return { employeeId, shareBps: percentBps };
    })
    .filter((item): item is { employeeId: string; shareBps: number } => Boolean(item));
}

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

    const month = resolveMonthRef(new URL(req.url).searchParams.get("month"));

    const [settingRow, employees, sharesRows] = await Promise.all([
      prisma.vipWhatsappRateioSetting.upsert({
        where: { team },
        create: { team },
        update: {},
        select: {
          ownerPercentBps: true,
          othersPercentBps: true,
          taxPercentBps: true,
          payoutDaysCsv: true,
          updatedAt: true,
        },
      }),
      prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true },
        orderBy: { name: "asc" },
      }),
      prisma.vipWhatsappRateioShare.findMany({
        where: { team },
        select: { employeeId: true, shareBps: true },
      }),
    ]);

    const setting = toRateioSetting(settingRow);
    const payoutDates = payoutDatesForReferenceMonth(
      month.monthRef,
      setting.payoutDays
    ).map((d) => d.toISOString());

    const baseSharesMap = new Map<string, number>(
      sharesRows.map((share) => [share.employeeId, share.shareBps])
    );
    const normalizedShares = normalizeEmployeeShares(
      employees.map((employee) => employee.id),
      baseSharesMap
    );
    const sumSharesBps = Array.from(normalizedShares.values()).reduce(
      (acc, bps) => acc + bps,
      0
    );

    return NextResponse.json({
      ok: true,
      data: {
        monthRef: month.monthRef,
        setting: {
          ownerPercent: setting.ownerPercentBps / 100,
          othersPercent: setting.othersPercentBps / 100,
          taxPercent: setting.taxPercentBps / 100,
          payoutDays: setting.payoutDays,
          updatedAt: settingRow.updatedAt.toISOString(),
        },
        employeeShares: employees.map((employee) => ({
          employee: {
            id: employee.id,
            name: employee.name,
            login: employee.login,
          },
          percent: (normalizedShares.get(employee.id) || 0) / 100,
        })),
        employeeSharesSumPercent: sumSharesBps / 100,
        payoutDates,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao carregar configuração de rateio.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const [current, employees] = await Promise.all([
      prisma.vipWhatsappRateioSetting.upsert({
        where: { team },
        create: { team },
        update: {},
        select: {
          ownerPercentBps: true,
          othersPercentBps: true,
          taxPercentBps: true,
          payoutDaysCsv: true,
        },
      }),
      prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true },
      }),
    ]);

    const employeeIds = new Set(employees.map((employee) => employee.id));
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const ownerPercentBps = parsePercentToBps(
      body.ownerPercent,
      current.ownerPercentBps
    );
    const othersPercentBps = parsePercentToBps(
      body.othersPercent,
      current.othersPercentBps
    );
    const taxPercentBps = parsePercentToBps(body.taxPercent, current.taxPercentBps);
    const payoutDays = parseDaysInput(body.payoutDays ?? current.payoutDaysCsv);

    if (ownerPercentBps + othersPercentBps !== 10000) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A soma do percentual do responsável com o percentual dos outros deve ser 100%.",
        },
        { status: 400 }
      );
    }

    const parsedShares = parseEmployeeShares(body.employeeShares);
    const incomingShares = new Map<string, number>();
    for (const share of parsedShares) {
      if (!employeeIds.has(share.employeeId)) continue;
      incomingShares.set(share.employeeId, share.shareBps);
    }

    const normalizedShares = normalizeEmployeeShares(
      Array.from(employeeIds),
      incomingShares
    );
    const sharesSumBps = Array.from(normalizedShares.values()).reduce(
      (acc, bps) => acc + bps,
      0
    );
    if (sharesSumBps !== 10000 && normalizedShares.size > 0) {
      return NextResponse.json(
        { ok: false, error: "A soma dos percentuais por funcionário deve ser 100%." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const setting = await tx.vipWhatsappRateioSetting.upsert({
        where: { team },
        create: {
          team,
          ownerPercentBps,
          othersPercentBps,
          taxPercentBps,
          payoutDaysCsv: payoutDaysToCsv(payoutDays),
        },
        update: {
          ownerPercentBps,
          othersPercentBps,
          taxPercentBps,
          payoutDaysCsv: payoutDaysToCsv(payoutDays),
        },
        select: {
          ownerPercentBps: true,
          othersPercentBps: true,
          taxPercentBps: true,
          payoutDaysCsv: true,
          updatedAt: true,
        },
      });

      for (const employee of employees) {
        await tx.vipWhatsappRateioShare.upsert({
          where: {
            team_employeeId: {
              team,
              employeeId: employee.id,
            },
          },
          create: {
            team,
            employeeId: employee.id,
            shareBps: normalizedShares.get(employee.id) || 0,
          },
          update: {
            shareBps: normalizedShares.get(employee.id) || 0,
          },
        });
      }

      return setting;
    });

    const setting = toRateioSetting(updated);

    return NextResponse.json({
      ok: true,
      data: {
        setting: {
          ownerPercent: setting.ownerPercentBps / 100,
          othersPercent: setting.othersPercentBps / 100,
          taxPercent: setting.taxPercentBps / 100,
          payoutDays: setting.payoutDays,
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao salvar configuração de rateio.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
