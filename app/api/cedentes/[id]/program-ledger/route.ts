import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import {
  applyPointsPurchaseLedger,
  applyProgramTransfer,
} from "@/lib/program-inventory";
import type { Program } from "@/app/api/_helpers/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isProgram(v: string): v is Program {
  return v === "LATAM" || v === "SMILES" || v === "LIVELO" || v === "ESFERA";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: cedenteId } = await params;
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const okCed = await prisma.cedente.findFirst({
    where: { id: cedenteId },
    select: { id: true },
  });
  if (!okCed) return bad("Cedente não encontrado.", 404);

  const sp = new URL(req.url).searchParams;
  const programRaw = String(sp.get("program") || "").toUpperCase();
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || 50) || 50));

  const entries = await prisma.cedenteProgramLedgerEntry.findMany({
    where: {
      cedenteId,
      ...(programRaw && isProgram(programRaw) ? { program: programRaw } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ ok: true, items: entries });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: cedenteId } = await params;
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const cedente = await prisma.cedente.findFirst({
    where: { id: cedenteId },
    select: { id: true, status: true },
  });
  if (!cedente) return bad("Cedente não encontrado.", 404);
  if (cedente.status !== "APPROVED") return bad("Cedente não aprovado.", 400);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("JSON inválido");

  const action = String((body as any).action || "").toUpperCase();
  const team = session.team;

  try {
    if (action === "PURCHASE" || action === "BONUS") {
      const program = String((body as any).program || "").toUpperCase();
      if (!isProgram(program)) return bad("Programa inválido.");

      const points = action === "BONUS" ? 0 : Math.max(0, Math.trunc(Number((body as any).points) || 0));
      const bonusPoints = Math.max(0, Math.trunc(Number((body as any).bonusPoints) || 0));
      const totalCostCents = Math.max(0, Math.trunc(Number((body as any).totalCostCents) || 0));
      const note = (body as any).note ? String((body as any).note) : null;

      if (action === "PURCHASE" && points <= 0 && bonusPoints <= 0) {
        return bad("Informe pontos ou bônus.");
      }
      if (action === "BONUS" && bonusPoints <= 0) return bad("Informe o bônus em pontos.");

      await prisma.$transaction((tx) =>
        applyPointsPurchaseLedger(tx, {
          team,
          cedenteId,
          program,
          points: action === "BONUS" ? 0 : points,
          totalCostCents: action === "BONUS" ? 0 : totalCostCents,
          bonusPoints: action === "BONUS" ? bonusPoints : bonusPoints,
          note,
        })
      );

      return NextResponse.json({ ok: true });
    }

    if (action === "TRANSFER") {
      const from = String((body as any).fromProgram || "").toUpperCase();
      const to = String((body as any).toProgram || "").toUpperCase();
      if (!isProgram(from) || !isProgram(to)) return bad("Programas inválidos.");

      const points = Math.max(0, Math.trunc(Number((body as any).points) || 0));
      const bonusPoints = Math.max(0, Math.trunc(Number((body as any).bonusPoints) || 0));
      const note = (body as any).note ? String((body as any).note) : null;

      await prisma.$transaction((tx) =>
        applyProgramTransfer(tx, {
          team,
          cedenteId,
          from,
          to,
          points,
          bonusPoints,
          note,
        })
      );

      return NextResponse.json({ ok: true });
    }

    return bad("action inválida (use PURCHASE, BONUS ou TRANSFER).");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao gravar extrato.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
