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

function parseCapturedAt(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return new Date();
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.team) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });

  const capturedAt = parseCapturedAt(body.capturedAt);
  const date = capturedAt.toISOString();

  const cashCents = safeInt(body.cashCents, 0);
  const totalBrutoCents = safeInt(body.totalBrutoCents, 0);
  const totalDividasCents = safeInt(body.totalDividasCents, 0);
  const totalLiquidoCents = safeInt(body.totalLiquidoCents ?? body.totalImediatoCents, 0);

  await prisma.caixaImediatoSnapshot.create({
    data: {
      team: session.team,
      date,
      cashCents,
      totalBrutoCents,
      totalDividasCents,
      totalLiquidoCents,
    },
  });

  return NextResponse.json({ ok: true });
}
