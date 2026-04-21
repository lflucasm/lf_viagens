// lib/require-session.ts
import { readSessionCookie } from "@/lib/session";

export type SessionLike = {
  userId: string;
  login: string;
  role: "admin" | "staff";
  team: string;
};

function parseCookies(header: string | null) {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

export function requireSession(req: Request): SessionLike {
  const cookies = parseCookies(req.headers.get("cookie"));
  const raw = cookies["tm.session"];
  const decodedRaw = raw ? decodeURIComponent(raw) : null;

  const s = readSessionCookie(decodedRaw);
  if (!s) {
    throw new Error("Não autenticado/sem permissão (cookie tm.session não chegou)");
  }

  return { userId: s.id, login: s.login, role: s.role, team: s.team };
}
