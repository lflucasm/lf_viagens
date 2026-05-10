// lib/auth-server.ts
import "server-only";
import { cookies } from "next/headers";
import { CANONICAL_OPERATION_TEAM } from "@/lib/canonical-team";

type Role = "admin" | "staff" | "developer";

export type Session = {
  id: string;
  login: string;
  role: Role;
  team: string;
};

function b64urlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
  return Buffer.from(padded, "base64").toString("utf8");
}

export async function getSessionServer(): Promise<Session | null> {
  try {
    const jar = await cookies(); // ✅ Next 16: cookies() pode ser Promise
    const raw = jar.get("tm.session")?.value;
    if (!raw) return null;

    const json = b64urlDecode(raw);
    const s = JSON.parse(json);

    if (!s?.id || !s?.login || !s?.role) return null;

    return {
      id: String(s.id),
      login: String(s.login),
      role: s.role as Role,
      team: CANONICAL_OPERATION_TEAM,
    };
  } catch {
    return null;
  }
}

/**
 * ✅ Compat com os handlers que usam session.user
 * (ex: session.user.team)
 */
export async function getSessionFromCookies(): Promise<{ user: Session } | null> {
  const user = await getSessionServer();
  if (!user) return null;
  return { user };
}

/** Usa em rotas/API server-side. Lança UNAUTHENTICATED se não tiver sessão. */
export async function requireSession(): Promise<Session> {
  const sess = await getSessionServer();
  if (!sess) throw new Error("UNAUTHENTICATED");
  return sess;
}
