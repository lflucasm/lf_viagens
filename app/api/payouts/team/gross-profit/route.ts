import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function nextMonthStart(yyyyMm: string) {
  const [yStr, mStr] = String(yyyyMm || "").split("-");
  let y = Number(yStr);
  let m = Number(mStr);
  if (!y || !m) return "";
  m += 1;
  if (m === 13) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function addDaysISO(iso: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function GET(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    const meId = String((sess as any)?.id || "");
    if (!team || !meId) return bad("Não autenticado", 401);

    const url = new URL(req.url);
    const month = String(url.searchParams.get("month") || "");
    const date = String(url.searchParams.get("date") || "");

    let startDate = "";
    let endExclusive = "";

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date inválido. Use YYYY-MM-DD");
      startDate = date;
      endExclusive = addDaysISO(date, 1);
      if (!endExclusive) return bad("date inválido");
    } else {
      const m = month.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return bad("month inválido. Use YYYY-MM");
      startDate = `${m}-01`;
      endExclusive = nextMonthStart(m);
      if (!endExclusive) return bad("month inválido");
    }

    const agg = await prisma.employeePayout.aggregate({
      where: { team, date: { gte: startDate, lt: endExclusive } },
      _sum: { grossProfitCents: true },
    });

    const grossProfitCents = agg._sum.grossProfitCents || 0;

    return NextResponse.json({
      ok: true,
      startDate,
      endExclusive,
      grossProfitCents,
    });
  } catch (e: any) {
    const msg = e?.message === "UNAUTHENTICATED" ? "Não autenticado" : e?.message || String(e);
    const status = e?.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
