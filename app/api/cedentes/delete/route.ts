import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionCookie = {
  id: string;
  login: string;
  role: "admin" | "staff";
  team: string;
};

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

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

async function requirePassword(req: Request, password: string) {
  const cookie = readCookie(req, "tm.session");
  if (!cookie) return { ok: false as const, status: 401, error: "Não autenticado." };

  let session: SessionCookie | null = null;
  try {
    session = JSON.parse(b64urlDecode(cookie)) as SessionCookie;
  } catch {
    return { ok: false as const, status: 401, error: "Sessão inválida." };
  }

  if (!session?.id) return { ok: false as const, status: 401, error: "Sessão sem ID." };

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, passwordHash: true },
  });

  if (!user?.passwordHash) return { ok: false as const, status: 401, error: "Usuário não encontrado." };

  if (user.passwordHash !== sha256(password)) {
    return { ok: false as const, status: 401, error: "Senha inválida." };
  }

  return { ok: true as const, userId: user.id };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const ids = body?.ids;
    const password = String(body?.password ?? "").trim();

    if (!Array.isArray(ids) || !ids.length) {
      return NextResponse.json({ ok: false, error: "IDs ausentes." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ ok: false, error: "Senha ausente." }, { status: 400 });
    }

    const auth = await requirePassword(req, password);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const r = await prisma.cedente.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ ok: true, deleted: r.count });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao apagar." }, { status: 500 });
  }
}
