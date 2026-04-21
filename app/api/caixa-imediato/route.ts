import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
  name?: string;
};

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

export async function GET() {
  const session = await getServerSession();
  if (!session?.team) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const rows = await prisma.caixaImediatoSnapshot.findMany({
    where: { team: session.team },
    orderBy: [{ createdAt: "desc" }, { date: "desc" }],
    take: 2000,
    select: {
      id: true,
      date: true,
      createdAt: true,
      cashCents: true,
      totalBrutoCents: true,
      totalDividasCents: true,
      totalLiquidoCents: true,
    },
  });

  const latest = rows[0] || null;

  return NextResponse.json({
    ok: true,
    data: {
      latestCashCents: latest?.cashCents ?? 0,
      snapshots: rows.map((r) => ({
        id: r.id,
        date: r.date,
        createdAt: r.createdAt.toISOString(),
        cashCents: r.cashCents,
        totalBruto: r.totalBrutoCents,
        totalDividas: r.totalDividasCents,
        totalLiquido: r.totalLiquidoCents,
        totalBrutoCents: r.totalBrutoCents,
        totalDividasCents: r.totalDividasCents,
        totalImediatoCents: r.totalLiquidoCents,
      })),
    },
  });
}
