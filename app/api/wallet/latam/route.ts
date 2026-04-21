import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { LoyaltyProgram } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function bad(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: noCacheHeaders() }
  );
}

function intNonNeg(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

async function resolveUserId(session: any) {
  return session?.user?.id || session?.userId || session?.id || null;
}

export async function GET() {
  const session = await requireSession();
  const team = session.team;

  // ✅ TODOS os cedentes do time (sem heurística LATAM)
  const cedentes = await prisma.cedente.findMany({
    where: {
      owner: { team },
    },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      owner: { select: { id: true, name: true, login: true } },
    },
    orderBy: [{ nomeCompleto: "asc" }],
  });

  const balances = await prisma.walletBalance.findMany({
    where: { team, program: LoyaltyProgram.LATAM },
    select: { cedenteId: true, amountCents: true, updatedAt: true },
  });

  const byCedente: Record<string, { amountCents: number; updatedAt: string }> =
    {};
  for (const b of balances) {
    byCedente[b.cedenteId] = {
      amountCents: b.amountCents,
      updatedAt: b.updatedAt.toISOString(),
    };
  }

  const rows = cedentes.map((c) => ({
    ...c,
    wallet: byCedente[c.id]?.amountCents ?? 0,
    walletUpdatedAt: byCedente[c.id]?.updatedAt ?? null,
  }));

  // ✅ total eficiente (somatório direto no banco)
  const agg = await prisma.walletBalance.aggregate({
    where: { team, program: LoyaltyProgram.LATAM },
    _sum: { amountCents: true },
  });
  const totalCents = agg._sum.amountCents ?? 0;

  return NextResponse.json(
    { ok: true, rows, totalCents },
    { headers: noCacheHeaders() }
  );
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const team = session.team;
  const userId = await resolveUserId(session);

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido.");

  const cedenteId = String(body.cedenteId || "").trim();
  const amountCents = intNonNeg(body.amountCents);

  if (!cedenteId) return bad("cedenteId é obrigatório.");

  // garante que o cedente é do time
  const cedente = await prisma.cedente.findFirst({
    where: { id: cedenteId, owner: { team } },
    select: { id: true },
  });
  if (!cedente) return bad("Cedente não encontrado para seu time.", 404);

  const saved = await prisma.walletBalance.upsert({
    where: {
      team_cedenteId_program: {
        team,
        cedenteId,
        program: LoyaltyProgram.LATAM,
      },
    },
    create: {
      team,
      cedenteId,
      program: LoyaltyProgram.LATAM,
      amountCents,
      updatedById: userId,
    },
    update: {
      amountCents,
      updatedById: userId,
    },
    select: { cedenteId: true, amountCents: true, updatedAt: true },
  });

  // ✅ total eficiente (somatório direto no banco)
  const agg = await prisma.walletBalance.aggregate({
    where: { team, program: LoyaltyProgram.LATAM },
    _sum: { amountCents: true },
  });
  const totalCents = agg._sum.amountCents ?? 0;

  return NextResponse.json(
    {
      ok: true,
      saved: {
        cedenteId: saved.cedenteId,
        amountCents: saved.amountCents,
        updatedAt: saved.updatedAt.toISOString(),
      },
      totalCents,
    },
    { headers: noCacheHeaders() }
  );
}
