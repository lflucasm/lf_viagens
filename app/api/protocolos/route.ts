// app/api/protocolos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

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

const OPEN_STATUSES = ["DRAFT", "SENT", "WAITING"] as const;
const STATUSES = new Set(["DRAFT", "SENT", "WAITING", "RESOLVED", "DENIED"]);
const PROGRAMS = new Set(["LATAM", "SMILES", "LIVELO", "ESFERA"]);

export async function GET(req: NextRequest) {
  const session = await requireSession();
  const url = new URL(req.url);

  const program = String(url.searchParams.get("program") || "").toUpperCase();
  if (!PROGRAMS.has(program)) return bad("program inválido");

  const cedenteId = String(url.searchParams.get("cedenteId") || "");
  const onlyOpen = (url.searchParams.get("onlyOpen") ?? "0") === "1";

  // ✅ regra do seu front:
  // - sem cedente => onlyOpen=1
  // - com cedente => cedenteId obrigatório
  if (!onlyOpen && !cedenteId) return bad("cedenteId é obrigatório (ou use onlyOpen=1)");

  // ✅ se vier cedenteId, garante que é do time (igual sua versão antiga)
  if (cedenteId) {
    const ced = await prisma.cedente.findFirst({
      where: { id: cedenteId, owner: { team: session.team } },
      select: { id: true },
    });
    if (!ced) return bad("Cedente não encontrado (ou fora do time).", 404);
  }

  const where: any = {
    team: session.team,
    program,
    ...(cedenteId ? { cedenteId } : {}),
  };

  // ✅ status: se onlyOpen e não veio status, usa OPEN_STATUSES
  if (onlyOpen && !url.searchParams.get("status")) {
    where.status = { in: OPEN_STATUSES as any };
  } else if (url.searchParams.get("status")) {
    const s = String(url.searchParams.get("status") || "").toUpperCase();
    if (!STATUSES.has(s)) return bad("status inválido");
    where.status = s;
  }

  const rows = await prisma.protocol.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      program: true,
      status: true,
      title: true,
      complaint: true,
      response: true,
      cedenteId: true,
      createdAt: true,
      updatedAt: true,

      // ✅ pra lista “abertos do programa” (sem cedente selecionado)
      // (não atrapalha quando vier cedenteId)
      cedente: {
        select: { id: true, identificador: true, nomeCompleto: true },
      },
    },
  });

  return NextResponse.json({ ok: true, rows }, { headers: noCacheHeaders() });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const program = String(body.program || "").toUpperCase();
  if (!PROGRAMS.has(program)) return bad("program inválido");

  const cedenteId = String(body.cedenteId || "");
  if (!cedenteId) return bad("cedenteId inválido");

  const title = String(body.title || "").slice(0, 120) || "Novo protocolo";
  const complaint = body.complaint != null ? String(body.complaint) : "";

  const statusRaw = body.status != null ? String(body.status).toUpperCase() : "DRAFT";
  if (!STATUSES.has(statusRaw)) return bad("status inválido");

  // ✅ garante que o cedente é do time
  const cedente = await prisma.cedente.findFirst({
    where: { id: cedenteId, owner: { team: session.team } },
    select: { id: true },
  });
  if (!cedente) return bad("Cedente não encontrado", 404);

  const row = await prisma.protocol.create({
    data: {
      team: session.team,
      program: program as any,
      status: statusRaw as any,
      title,
      complaint,
      cedenteId,
      createdById: session.id,
      updatedById: session.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, row }, { headers: noCacheHeaders() });
}
