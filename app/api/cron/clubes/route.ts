// app/api/cron/clubes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autoUpdateClubStatuses } from "@/lib/clubes-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() || "";
  const token = getBearer(req) || new URL(req.url).searchParams.get("secret")?.trim() || "";

  if (!secret || token !== secret) return bad("Não autorizado", 401);

  try {
    const teams = await prisma.clubSubscription.findMany({
      select: { team: true },
      distinct: ["team"],
    });

    let changedTotal = 0;

    for (const t of teams) {
      const r = await autoUpdateClubStatuses(t.team);
      changedTotal += r.changed;
    }

    return NextResponse.json({ ok: true, teams: teams.length, changed: changedTotal });
  } catch (e: any) {
    return bad("Falha ao rodar cron", 500);
  }
}
