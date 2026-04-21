import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  clearAffiliateSessionCookie,
  setAffiliateSessionCookie,
} from "@/lib/affiliates/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiLogin = { action: "login"; login: string; password: string };
type ApiLogout = { action: "logout" };
type ApiBody = ApiLogin | ApiLogout;

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function isApiBody(value: unknown): value is ApiBody {
  if (!value || typeof value !== "object") return false;
  const action = (value as { action?: string }).action;
  return action === "login" || action === "logout";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!isApiBody(body)) {
      return NextResponse.json(
        { ok: false, error: "Ação inválida." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (body.action === "logout") {
      const res = NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
      clearAffiliateSessionCookie(res);
      return res;
    }

    const login = norm(body.login);
    const password = String(body.password ?? "");
    if (!login || !password) {
      return NextResponse.json(
        { ok: false, error: "Informe login e senha." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: { login, isActive: true },
      select: {
        id: true,
        team: true,
        name: true,
        login: true,
        passwordHash: true,
      },
    });

    if (!affiliate?.login || !affiliate.passwordHash) {
      return NextResponse.json(
        { ok: false, error: "Afiliado não encontrado ou sem acesso liberado." },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    if (affiliate.passwordHash !== sha256(password)) {
      return NextResponse.json(
        { ok: false, error: "Senha inválida." },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { lastLoginAt: new Date() },
    });

    const res = NextResponse.json(
      {
        ok: true,
        data: {
          affiliate: {
            id: affiliate.id,
            name: affiliate.name,
            login: affiliate.login,
          },
        },
      },
      { headers: noCacheHeaders() }
    );
    setAffiliateSessionCookie(res, {
      id: affiliate.id,
      login: affiliate.login,
      name: affiliate.name,
      team: affiliate.team,
    });
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao autenticar afiliado.";
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noCacheHeaders() });
  }
}
