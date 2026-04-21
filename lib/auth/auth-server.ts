// lib/auth-server.ts
import "server-only";
import { cookies } from "next/headers";

export type SessionServer = {
  id: string;
  team: string;
  role?: string;
  // opcional: guarde o token bruto se quiser
  token?: string;
};

const COOKIE_NAME_CANDIDATES = ["tm.session", "tm_session", "session", "token"];

function decodeBase64Url(input: string) {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function tryParseSession(raw: string): any | null {
  const candidates = [raw];

  // urlencoded JSON
  try {
    candidates.push(decodeURIComponent(raw));
  } catch {}

  for (const c of candidates) {
    // JSON direto
    try {
      return JSON.parse(c);
    } catch {}

    // JSON em base64
    try {
      const json = Buffer.from(c, "base64").toString("utf8");
      return JSON.parse(json);
    } catch {}

    // JWT (header.payload.signature) → decodifica payload
    if (c.split(".").length === 3) {
      try {
        const payload = c.split(".")[1];
        const json = decodeBase64Url(payload);
        return JSON.parse(json);
      } catch {}
    }
  }

  return null;
}

function normalizeSession(obj: any, tokenRaw?: string): SessionServer | null {
  if (!obj || typeof obj !== "object") return null;

  const id =
    obj.id ??
    obj.userId ??
    obj.sub ??
    obj.user?.id ??
    obj.user?.userId ??
    null;

  const team =
    obj.team ??
    obj.tenant ??
    obj.org ??
    obj.user?.team ??
    obj.user?.tenant ??
    null;

  const role = obj.role ?? obj.user?.role ?? undefined;

  if (!id || !team) return null;

  return {
    id: String(id),
    team: String(team),
    ...(role ? { role: String(role) } : {}),
    ...(tokenRaw ? { token: tokenRaw } : {}),
  };
}

export async function getSessionServer(): Promise<SessionServer | null> {
  const store = await cookies();

  const raw =
    COOKIE_NAME_CANDIDATES.map((n) => store.get(n)?.value).find(Boolean) ?? null;

  if (!raw) return null;

  const parsed = tryParseSession(raw);
  const normalized = normalizeSession(parsed, raw);

  return normalized;
}

export async function requireSession(): Promise<SessionServer> {
  const sess = await getSessionServer();
  if (!sess) throw new Error("UNAUTHENTICATED");
  return sess;
}