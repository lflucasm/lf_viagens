import { NextResponse } from "next/server";
import { getAffiliateSessionServer } from "@/lib/affiliates/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAffiliateSessionServer();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, data: { affiliate: session } });
}
