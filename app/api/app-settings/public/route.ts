import { NextResponse } from "next/server";
import { getPublicAppSettingsPayload } from "@/lib/app-settings-ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

export async function GET() {
  try {
    const data = await getPublicAppSettingsPayload();
    return NextResponse.json({ ok: true, data }, { headers: headers() });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "Não foi possível carregar as configurações." },
      { status: 500, headers: headers() }
    );
  }
}
