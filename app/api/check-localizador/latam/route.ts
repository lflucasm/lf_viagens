import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
};

const MANUAL_STATUS = ["CANCELADO", "CONFIRMADO", "ALTERADO"] as const;
type ManualStatus = (typeof MANUAL_STATUS)[number];

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

function buildLatamUrl(purchaseCode: string, lastName: string) {
  return `https://www.latamairlines.com/br/pt/minhas-viagens/second-detail?orderId=${encodeURIComponent(
    purchaseCode
  )}&lastname=${encodeURIComponent(lastName)}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const rows = await prisma.sale.findMany({
    where: {
      program: "LATAM",
      purchaseCode: { startsWith: "LA", mode: "insensitive" },
      firstPassengerLastName: { not: null },
      NOT: [{ firstPassengerLastName: "" }],
    },
    select: {
      id: true,
      numero: true,
      locator: true,
      purchaseCode: true,
      firstPassengerLastName: true,
      departureDate: true,
      returnDate: true,
      latamLocatorCheckStatus: true,
      latamLocatorCheckedAt: true,
      latamLocatorCheckNote: true,
      cedente: { select: { identificador: true, nomeCompleto: true } },
      createdAt: true,
    },
    take: 5000,
  });

  const mapped = rows.map((r) => ({
    ...r,
    departureDate: r.departureDate ? r.departureDate.toISOString() : null,
    returnDate: r.returnDate ? r.returnDate.toISOString() : null,
    checkUrl: buildLatamUrl(String(r.purchaseCode || ""), String(r.firstPassengerLastName || "")),
    latamLocatorCheckedAt: r.latamLocatorCheckedAt ? r.latamLocatorCheckedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  mapped.sort((a, b) => {
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
  const status = statusRaw as ManualStatus;

  if (!saleId) {
    return NextResponse.json({ ok: false, error: "saleId obrigatório." }, { status: 400 });
  }
  if (!statusRaw) {
    return NextResponse.json(
      { ok: false, error: "Informe o status manual (CANCELADO/CONFIRMADO/ALTERADO)." },
      { status: 400 }
    );
  }
  if (!MANUAL_STATUS.includes(status)) {
    return NextResponse.json({ ok: false, error: "Status manual inválido." }, { status: 400 });
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      program: true,
    },
  });

  if (!sale || sale.program !== "LATAM") {
    return NextResponse.json({ ok: false, error: "Venda LATAM não encontrada." }, { status: 404 });
  }

  const updated = await prisma.sale.update({
    where: { id: saleId },
    data: {
      latamLocatorCheckStatus: status,
      latamLocatorCheckedAt: new Date(),
      latamLocatorCheckNote: "Atualização manual.",
    },
    select: {
      id: true,
      latamLocatorCheckStatus: true,
      latamLocatorCheckedAt: true,
      latamLocatorCheckNote: true,
    },
  });

  return NextResponse.json({
    ok: true,
    row: {
      ...updated,
      latamLocatorCheckedAt: updated.latamLocatorCheckedAt
        ? updated.latamLocatorCheckedAt.toISOString()
        : null,
    },
  });
}
