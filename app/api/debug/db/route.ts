import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    DATABASE_URL_host: process.env.DATABASE_URL?.split("@")?.[1]?.split("/")?.[0] || null,
    DIRECT_URL_host: process.env.DIRECT_URL?.split("@")?.[1]?.split("/")?.[0] || null,
    VERCEL_ENV: process.env.VERCEL_ENV || null,
  });
}
