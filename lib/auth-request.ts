import type { NextRequest } from "next/server";

export type SessionLite = {
  id: string;
  team: string;
  login?: string;
  name?: string;
  role?: string;
};

const COOKIE_CANDIDATES = [
  "tm_session",
  "trademiles_session",
  "session",
  "auth_session",
  "token",
];

function tryJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function tryBase64Json(s: string) {
  try {
    const buf = Buffer.from(s, "base64");
    const txt = buf.toString("utf8");
    return tryJsonParse(txt);
  } catch {
    return null;
  }
}

function tryJwtPayload(s: string) {
  // formato: header.payload.signature
  const parts = s.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const txt = Buffer.from(payload, "base64").toString("utf8");
    return tryJsonParse(txt);
  } catch {
    return null;
  }
}

function normalizeSession(obj: any): SessionLite | null {
  if (!obj || typeof obj !== "object") return null;

  const team = String(obj.team || obj.tenant || obj.org || "");
  const id = String(obj.id || obj.userId || obj.uid || "");

  if (!team || !id) return null;

  return {
    team,
    id,
    login: obj.login ? String(obj.login) : undefined,
    name: obj.name ? String(obj.name) : undefined,
    role: obj.role ? String(obj.role) : undefined,
  };
}

export function getSessionFromRequest(req: NextRequest): SessionLite | null {
  // ✅ 1) Headers (funciona com sessão client/localStorage)
  const teamH = req.headers.get("x-team") || req.headers.get("x-trademiles-team");
  const idH = req.headers.get("x-user-id") || req.headers.get("x-trademiles-user");
  if (teamH && idH) {
    return { team: teamH, id: idH };
  }

  // ✅ 2) Cookie (se você tiver sessão em cookie)
  for (const name of COOKIE_CANDIDATES) {
    const v = req.cookies.get(name)?.value;
    if (!v) continue;

    const a = tryJsonParse(v);
    const b = tryBase64Json(v);
    const c = tryJwtPayload(v);

    const sess = normalizeSession(a || b || c);
    if (sess) return sess;
  }

  return null;
}
