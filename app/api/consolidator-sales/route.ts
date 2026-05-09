import { NextRequest, NextResponse } from "next/server";
import type { ConsolidatorSaleSettlementStatus } from "@prisma/client";
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

function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: noCacheHeaders() });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

function parseMoneyToCents(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function commissionBpsFrom(totalCents: number, commissionCents: number): number | null {
  if (totalCents <= 0) return null;
  return Math.round((commissionCents * 10000) / totalCents);
}

function toRow(item: {
  id: string;
  consolidatorName: string;
  clientName: string;
  totalCents: number;
  commissionCents: number;
  commissionBps: number | null;
  status: ConsolidatorSaleSettlementStatus;
  releasedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string; login: string };
  releasedBy: { id: string; name: string; login: string } | null;
}) {
  return {
    id: item.id,
    consolidatorName: item.consolidatorName,
    clientName: item.clientName,
    totalCents: item.totalCents,
    commissionCents: item.commissionCents,
    commissionBps: item.commissionBps,
    status: item.status,
    releasedAt: item.releasedAt?.toISOString() ?? null,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdBy: item.createdBy,
    releasedBy: item.releasedBy,
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    const team = session?.team;
    if (!team) return bad("Sessão inválida.", 401);

    const rows = await prisma.consolidatorSale.findMany({
      where: { team },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        consolidatorName: true,
        clientName: true,
        totalCents: true,
        commissionCents: true,
        commissionBps: true,
        status: true,
        releasedAt: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true, login: true } },
        releasedBy: { select: { id: true, name: true, login: true } },
      },
    });

    return ok({ rows: rows.map(toRow) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao carregar vendas da consolidadora.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const team = session?.team;
    const userId = session?.id;
    if (!team || !userId) return bad("Sessão inválida.", 401);

    const body = await req.json().catch(() => ({}));

    const consolidatorName = String(body?.consolidatorName || "").trim();
    const clientName = String(body?.clientName || "").trim();
    const notesRaw = String(body?.notes || "").trim();

    const totalCents = parseMoneyToCents(body?.total);
    const commissionCents = parseMoneyToCents(body?.commission);

    if (!consolidatorName) return bad("Informe a consolidadora.");
    if (!clientName) return bad("Informe o cliente (para quem vendeu).");
    if (totalCents <= 0) return bad("Informe o valor total.");
    if (commissionCents < 0) return bad("Comissão inválida.");
    if (commissionCents > totalCents) {
      return bad("A comissão não pode ser maior que o valor total.");
    }

    const commissionBps = commissionBpsFrom(totalCents, commissionCents);

    const created = await prisma.consolidatorSale.create({
      data: {
        team,
        consolidatorName,
        clientName,
        totalCents,
        commissionCents,
        commissionBps,
        notes: notesRaw || null,
        createdById: userId,
      },
      select: {
        id: true,
        consolidatorName: true,
        clientName: true,
        totalCents: true,
        commissionCents: true,
        commissionBps: true,
        status: true,
        releasedAt: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true, login: true } },
        releasedBy: { select: { id: true, name: true, login: true } },
      },
    });

    return ok({ row: toRow(created) }, 201);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao registrar venda da consolidadora.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return bad(message === "UNAUTHENTICATED" ? "Não autenticado." : message, status);
  }
}
