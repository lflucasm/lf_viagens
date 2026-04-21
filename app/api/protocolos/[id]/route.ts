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

const STATUSES = new Set(["DRAFT", "SENT", "WAITING", "RESOLVED", "DENIED"]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await requireSession();
  const { id } = await params;

  const protocolId = String(id || "");
  if (!protocolId) return bad("id inválido");

  const row = await prisma.protocol.findFirst({
    where: { id: protocolId, team: session.team },
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
    },
  });

  if (!row) return bad("Protocolo não encontrado", 404);
  return NextResponse.json({ ok: true, row }, { headers: noCacheHeaders() });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await requireSession();
  const { id } = await params;

  const protocolId = String(id || "");
  if (!protocolId) return bad("id inválido");

  const body = await req.json().catch(() => null);
  if (!body) return bad("JSON inválido");

  const title =
    body.title != null ? String(body.title).slice(0, 120) : undefined;
  const complaint = body.complaint != null ? String(body.complaint) : undefined;
  const response = body.response != null ? String(body.response) : undefined;

  let status: string | undefined = undefined;
  if (body.status != null) {
    const s = String(body.status).toUpperCase();
    if (!STATUSES.has(s)) return bad("status inválido");
    status = s;
  }

  const exists = await prisma.protocol.findFirst({
    where: { id: protocolId, team: session.team },
    select: { id: true },
  });
  if (!exists) return bad("Protocolo não encontrado", 404);

  const row = await prisma.protocol.update({
    where: { id: protocolId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(complaint !== undefined ? { complaint } : {}),
      ...(response !== undefined ? { response } : {}),
      ...(status !== undefined ? { status: status as any } : {}),
      updatedById: session.id,
    },
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
    },
  });

  return NextResponse.json({ ok: true, row }, { headers: noCacheHeaders() });
}
