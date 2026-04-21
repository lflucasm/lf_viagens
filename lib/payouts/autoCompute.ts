import { prisma } from "@/lib/prisma";

export type EmployeePayoutBasis = "SALE_DATE" | "PURCHASE_FINALIZED";

function readBasis(breakdown: unknown): EmployeePayoutBasis | null {
  const basis = (breakdown as { basis?: unknown } | null)?.basis;
  if (basis === "SALE_DATE" || basis === "PURCHASE_FINALIZED") return basis;
  return null;
}

export function todayISORecife() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;

  return `${map.year}-${map.month}-${map.day}`;
}

async function basisForDate(team: string, date: string, fallback: EmployeePayoutBasis) {
  const existing = await prisma.employeePayout.findFirst({
    where: { team, date },
    orderBy: [{ paidAt: "desc" }, { updatedAt: "desc" }],
    select: { breakdown: true },
  });

  return readBasis(existing?.breakdown) || fallback;
}

export async function triggerEmployeePayoutAutoCompute(
  req: Request,
  args: {
    team: string;
    date?: string;
    fallbackBasis: EmployeePayoutBasis;
  }
) {
  const date = args.date || todayISORecife();

  try {
    const basis = await basisForDate(args.team, date, args.fallbackBasis);
    const computeUrl = new URL("/api/payouts/funcionarios/compute", req.url);

    const res = await fetch(computeUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        date,
        basis,
        force: false,
      }),
    });

    const payload = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      users?: number;
      purchasesFinalized?: number;
      salesForCommission?: number;
      balcaoOps?: number;
    } | null;

    return {
      ok: res.ok && payload?.ok !== false,
      date,
      basis,
      users: Number(payload?.users || 0),
      purchasesFinalized: Number(payload?.purchasesFinalized || 0),
      salesForCommission: Number(payload?.salesForCommission || 0),
      balcaoOps: Number(payload?.balcaoOps || 0),
      error: res.ok ? null : payload?.error || `Falha ao recalcular comissões (${res.status}).`,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      date,
      basis: args.fallbackBasis,
      users: 0,
      purchasesFinalized: 0,
      salesForCommission: 0,
      balcaoOps: 0,
      error: error instanceof Error ? error.message : "Falha ao recalcular comissões.",
    };
  }
}
