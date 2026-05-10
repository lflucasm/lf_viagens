import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addDaysISO(dateISO: string, n: number) {
  const d = new Date(`${dateISO}T12:00:00-03:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function recifeTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function boundsFromRecifeDate(dateISO: string) {
  const start = new Date(`${dateISO}T00:00:00-03:00`);
  return start;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = new URL(req.url).searchParams;
    const fromParam = String(sp.get("from") || "").trim();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : recifeTodayISO();
    const days = Math.min(120, Math.max(1, Math.trunc(Number(sp.get("days") || 60) || 60)));
    const endISO = addDaysISO(from, days);
    const startAt = boundsFromRecifeDate(from);
    const endAt = boundsFromRecifeDate(endISO);

    const sales = await prisma.sale.findMany({
      where: {
        paymentStatus: { not: "CANCELED" },
        departureDate: { gte: startAt, lt: endAt },
        locator: { not: null },
        NOT: { locator: "" },
        cedente: { owner: { team: session.team } },
      },
      orderBy: [{ departureDate: "asc" }, { locator: "asc" }],
      select: {
        id: true,
        numero: true,
        locator: true,
        program: true,
        points: true,
        passengers: true,
        milheiroCents: true,
        totalCents: true,
        departureDate: true,
        returnDate: true,
        departureAirportIata: true,
        firstPassengerLastName: true,
        cliente: { select: { id: true, nome: true, identificador: true } },
        cedente: { select: { id: true, nomeCompleto: true, identificador: true } },
      },
    });

    const trips = sales.map((s) => ({
      kind: "sale" as const,
      id: s.id,
      numero: s.numero,
      locator: s.locator as string,
      program: s.program,
      points: s.points,
      passengers: s.passengers,
      milheiroCents: s.milheiroCents,
      totalCents: s.totalCents,
      departureDate: s.departureDate ? s.departureDate.toISOString() : null,
      returnDate: s.returnDate ? s.returnDate.toISOString() : null,
      departureAirportIata: s.departureAirportIata,
      firstPassengerLastName: s.firstPassengerLastName,
      cliente: s.cliente,
      cedente: s.cedente,
    }));

    return NextResponse.json({ ok: true, from, days, trips });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    const status = msg === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg === "UNAUTHENTICATED" ? "Não autenticado" : msg }, { status });
  }
}
