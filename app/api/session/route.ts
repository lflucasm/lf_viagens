// app/api/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CANONICAL_OPERATION_TEAM } from "@/lib/canonical-team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff" | "developer";
  // se você salvar isso no cookie, habilita aqui:
  name?: string;
  email?: string | null;
};

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

export async function GET() {
  try {
    const store = await cookies();
    const raw = store.get("tm.session")?.value ?? "";

    if (!raw) {
      return NextResponse.json(
        { ok: true, hasSession: false, user: null },
        { headers: noCache() }
      );
    }

    let sess: Sess | null = null;
    try {
      sess = JSON.parse(b64urlDecode(raw)) as Sess;
    } catch {
      sess = null;
    }

    if (!sess?.id || !sess?.login || !sess?.role) {
      return NextResponse.json(
        { ok: true, hasSession: false, user: null },
        { headers: noCache() }
      );
    }

    const login = String(sess.login);
    const user = {
      id: String(sess.id),
      login,
      team: CANONICAL_OPERATION_TEAM,
      role: sess.role,
      name: (sess.name && String(sess.name).trim()) || login,
      email: sess.email ?? null,
    };

    return NextResponse.json(
      { ok: true, hasSession: true, user },
      { headers: noCache() }
    );
  } catch {
    return NextResponse.json(
      { ok: true, hasSession: false, user: null },
      { headers: noCache() }
    );
  }
}
