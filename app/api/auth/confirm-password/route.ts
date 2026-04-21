import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "staff";

type SessionCookie = {
  id: string;
  login: string;
  role: Role;
  team: string;
};

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// base64url -> json
function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";").map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return null;
  return decodeURIComponent(hit.slice(name.length + 1));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const password = String(body?.password ?? "").trim();

    if (!password) {
      return NextResponse.json({ ok: false, error: "Senha ausente." }, { status: 400 });
    }

    // 1) precisa estar logado (cookie)
    const cookie = readCookie(req, "tm.session");
    if (!cookie) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    let session: SessionCookie | null = null;
    try {
      session = JSON.parse(b64urlDecode(cookie)) as SessionCookie;
    } catch {
      return NextResponse.json({ ok: false, error: "Sessão inválida." }, { status: 401 });
    }

    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Sessão sem ID." }, { status: 401 });
    }

    // 2) busca usuário e compara hash
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 401 });
    }

    const ok = user.passwordHash === sha256(password);

    if (!ok) {
      return NextResponse.json({ ok: false, error: "Senha inválida." }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro." }, { status: 500 });
  }
}
