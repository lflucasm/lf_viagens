import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const AFFILIATE_COOKIE = "tm.affiliate.session";

export type AffiliateSession = {
  id: string;
  login: string;
  name: string;
  team: string;
};

function b64urlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
  return Buffer.from(padded, "base64").toString("utf8");
}

export function setAffiliateSessionCookie(res: NextResponse, payload: AffiliateSession) {
  const value = b64urlEncode(JSON.stringify(payload));
  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set(AFFILIATE_COOKIE, value, { ...base, domain });
  else res.cookies.set(AFFILIATE_COOKIE, value, base);
}

export function clearAffiliateSessionCookie(res: NextResponse) {
  const base = { path: "/" as const, maxAge: 0 };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set(AFFILIATE_COOKIE, "", { ...base, domain });
  else res.cookies.set(AFFILIATE_COOKIE, "", base);
}

export function parseAffiliateSession(raw?: string | null): AffiliateSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(b64urlDecode(raw)) as Partial<AffiliateSession>;
    if (!data?.id || !data?.login || !data?.name || !data?.team) return null;
    return {
      id: String(data.id),
      login: String(data.login),
      name: String(data.name),
      team: String(data.team),
    };
  } catch {
    return null;
  }
}

export async function getAffiliateSessionServer() {
  const jar = await cookies();
  return parseAffiliateSession(jar.get(AFFILIATE_COOKIE)?.value);
}
