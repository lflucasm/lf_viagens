import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePercent(v: any) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 100) return null;
  return Math.round(n);
}

function parseDateOrNull(v: any): Date | null | undefined {
  // undefined = não mexe; null/"" = limpa
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000` : s);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

export async function GET() {
  const settings = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: {
      taxPercent: true,
      taxEffectiveFrom: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        taxPercent: settings.taxPercent ?? 8,
        taxEffectiveFrom: settings.taxEffectiveFrom
          ? settings.taxEffectiveFrom.toISOString()
          : null,
      },
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const role = String((session as any)?.role || "");
    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const taxPercent = parsePercent(body?.taxPercent);
    const taxEffectiveFrom = parseDateOrNull(body?.taxEffectiveFrom);

    if (taxPercent === null) {
      return NextResponse.json(
        { ok: false, error: "Percentual inválido (1–100)." },
        { status: 400 }
      );
    }
    if (taxEffectiveFrom === undefined) {
      return NextResponse.json({ ok: false, error: "Data de início inválida." }, { status: 400 });
    }

    const saved = await prisma.settings.upsert({
      where: { key: "default" },
      create: {
        key: "default",
        taxPercent,
        taxEffectiveFrom: taxEffectiveFrom ?? null,
      },
      update: {
        taxPercent,
        taxEffectiveFrom: taxEffectiveFrom ?? null,
      },
      select: {
        taxPercent: true,
        taxEffectiveFrom: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          taxPercent: saved.taxPercent ?? 8,
          taxEffectiveFrom: saved.taxEffectiveFrom
            ? saved.taxEffectiveFrom.toISOString()
            : null,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || "Erro";
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
