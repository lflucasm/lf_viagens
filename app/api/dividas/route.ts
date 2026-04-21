// app/api/dividas/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCentsFromInput(s: any) {
  // aceita "1.234,56" | "1234,56" | "1234.56"
  const cleaned = String(s ?? "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function safeInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function strOrNull(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseDateOrNull(v: any): Date | null | undefined {
  // undefined = não mexe; null/"" = limpa
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // aceita YYYY-MM-DD ou ISO
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000` : s);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

function parseOrderOrNull(v: any): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function GET() {
  try {
    const debts = await prisma.debt.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        payments: { orderBy: { paidAt: "desc" } },
      },
    });

    const data = debts.map((d) => {
      const paidCents = d.payments.reduce((a, p) => a + safeInt(p.amountCents), 0);
      const balanceCents = Math.max(0, safeInt(d.totalCents) - paidCents);

      return {
        id: d.id,
        title: d.title,
        description: d.description,
        totalCents: safeInt(d.totalCents),
        paidCents,
        balanceCents,
        status: d.status,
        creditorName: d.creditorName || null,
        dueDate: d.dueDate ? d.dueDate.toISOString() : null,
        payOrder: typeof d.payOrder === "number" ? d.payOrder : null,
        createdAt: d.createdAt.toISOString(),
        payments: d.payments.map((p) => ({
          id: p.id,
          amountCents: safeInt(p.amountCents),
          note: p.note,
          paidAt: p.paidAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao carregar dívidas." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));

    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim() || null;
    const creditorName = strOrNull(body?.creditorName);
    const dueDate = parseDateOrNull(body?.dueDate);
    const payOrder = parseOrderOrNull(body?.payOrder);

    // ✅ teu frontend manda "total" (string). Aqui converto para centavos.
    const totalCents = toCentsFromInput(body?.total);

    if (!title) {
      return NextResponse.json({ ok: false, error: "Informe a descrição/título." }, { status: 400 });
    }
    if (totalCents <= 0) {
      return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });
    }
    if (dueDate === undefined) {
      return NextResponse.json({ ok: false, error: "Data de vencimento inválida." }, { status: 400 });
    }

    const created = await prisma.debt.create({
      data: {
        title,
        description,
        totalCents,
        creditorName,
        dueDate: dueDate ?? null,
        payOrder: payOrder ?? null,
        status: "OPEN",
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar dívida." },
      { status: 500 }
    );
  }
}
