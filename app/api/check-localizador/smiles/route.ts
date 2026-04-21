import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
};

const SMILES_MANUAL_STATUS = ["CONFIRMADO", "DERRUBADO"] as const;
type SmilesManualStatus = (typeof SMILES_MANUAL_STATUS)[number];

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

function parseDateMs(v?: string | null) {
  if (!v) return null;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getTime();
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function proximityKey(args: { departureDate?: string | null; returnDate?: string | null }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nowMs = today.getTime();

  const ds = [parseDateMs(args.departureDate), parseDateMs(args.returnDate)].filter(
    (x): x is number => x != null
  );

  if (!ds.length) return { hasUpcoming: 0, diff: Number.MAX_SAFE_INTEGER };

  const upcoming = ds.filter((x) => x >= nowMs);
  if (upcoming.length) {
    return { hasUpcoming: 1, diff: Math.min(...upcoming) - nowMs };
  }

  const nearestAbs = Math.min(...ds.map((x) => Math.abs(x - nowMs)));
  return { hasUpcoming: 0, diff: nearestAbs };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const saleDb = prisma.sale as any;
  const rows = await saleDb.findMany({
    where: {
      program: "SMILES",
      locator: { not: null },
      firstPassengerLastName: { not: null },
      NOT: [{ locator: "" }, { firstPassengerLastName: "" }],
    },
    select: {
      id: true,
      numero: true,
      locator: true,
      firstPassengerLastName: true,
      departureAirportIata: true,
      departureDate: true,
      returnDate: true,
      smilesLocatorManualStatus: true,
      smilesLocatorManualCheckedAt: true,
      smilesLocatorLossCents: true,
      cedente: { select: { identificador: true, nomeCompleto: true } },
      createdAt: true,
    },
    take: 5000,
  });

  const mapped = rows.map((r: any) => ({
    ...r,
    departureDate: r.departureDate ? r.departureDate.toISOString() : null,
    returnDate: r.returnDate ? r.returnDate.toISOString() : null,
    smilesLocatorManualStatus: r.smilesLocatorManualStatus || null,
    smilesLocatorManualCheckedAt: r.smilesLocatorManualCheckedAt
      ? r.smilesLocatorManualCheckedAt.toISOString()
      : null,
    smilesLocatorLossCents: safeInt(r.smilesLocatorLossCents, 0),
    createdAt: r.createdAt.toISOString(),
  }));

  mapped.sort((a: any, b: any) => {
    const ka = proximityKey({ departureDate: a.departureDate, returnDate: a.returnDate });
    const kb = proximityKey({ departureDate: b.departureDate, returnDate: b.returnDate });
    if (ka.hasUpcoming !== kb.hasUpcoming) return kb.hasUpcoming - ka.hasUpcoming;
    if (ka.diff !== kb.diff) return ka.diff - kb.diff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ ok: true, rows: mapped });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const saleId = String(body?.saleId || "").trim();
  const statusRaw = String(body?.status || "").trim().toUpperCase();
  const status = statusRaw as SmilesManualStatus;
  const lossCents = Math.max(0, safeInt(body?.lossCents, 0));

  if (!saleId) {
    return NextResponse.json({ ok: false, error: "saleId obrigatório." }, { status: 400 });
  }
  if (statusRaw && !SMILES_MANUAL_STATUS.includes(status)) {
    return NextResponse.json({ ok: false, error: "Status manual inválido." }, { status: 400 });
  }
  if (status === "DERRUBADO" && lossCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "Informe o valor do prejuízo para marcar como derrubado." },
      { status: 400 }
    );
  }

  const saleDb = prisma.sale as any;
  const sale = await saleDb.findUnique({
    where: { id: saleId },
    select: { id: true, program: true },
  });

  if (!sale || sale.program !== "SMILES") {
    return NextResponse.json({ ok: false, error: "Venda SMILES não encontrada." }, { status: 404 });
  }

  const updated = await saleDb.update({
    where: { id: saleId },
    data: {
      smilesLocatorManualStatus: statusRaw ? status : null,
      smilesLocatorManualCheckedAt: statusRaw ? new Date() : null,
      smilesLocatorLossCents: status === "DERRUBADO" ? lossCents : 0,
    },
    select: {
      id: true,
      smilesLocatorManualStatus: true,
      smilesLocatorManualCheckedAt: true,
      smilesLocatorLossCents: true,
    },
  });

  return NextResponse.json({
    ok: true,
    row: {
      id: updated.id,
      smilesLocatorManualStatus: updated.smilesLocatorManualStatus || null,
      smilesLocatorManualCheckedAt: updated.smilesLocatorManualCheckedAt
        ? updated.smilesLocatorManualCheckedAt.toISOString()
        : null,
      smilesLocatorLossCents: safeInt(updated.smilesLocatorLossCents, 0),
    },
  });
}
