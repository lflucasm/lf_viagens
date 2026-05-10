import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "staff" | "developer";

const TEAM_LF = "LF Viagens";
/** Mesmo identificador de time do admin em produção — necessário para filtrar dados ao testar como developer. */
const TEAM_JEPHESSON = "@LF.Viagens";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// ✅ cookie pequeno (name/email opcionais — UI e /api/session)
type SessionCookie = {
  id: string;
  login: string;
  role: Role;
  team: string;
  name?: string;
  email?: string | null;
};

type ApiLogin = { action: "login"; login: string; password: string };
type ApiSetPassword = { action: "setPassword"; login: string; password: string };
type ApiResetSeed = { action: "resetSeed" };
type ApiLogout = { action: "logout" };
type ApiBody = ApiLogin | ApiSetPassword | ApiResetSeed | ApiLogout;

// ✅ seed REAL (vai pro banco) — apenas usuários
const SEED_USERS: Array<{
  login: string;
  name: string;
  email: string | null;
  role: Role;
  password: string;
}> = [
  {
    login: "jephesson",
    name: "Jephesson Alex Floriano dos Santos",
    email: "jephesson@gmail.com",
    role: "developer",
    password: "ufpb2010",
  },
  {
    login: "lucas_fellype",
    name: "Lucas Fellype",
    email: null,
    role: "admin",
    password: "Lucas@2026!",
  },
];

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

// Base64 URL-safe
function b64urlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function setSessionCookie(res: NextResponse, payload: SessionCookie) {
  const value = b64urlEncode(JSON.stringify(payload));

  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };

  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.session", value, { ...base, domain });
  else res.cookies.set("tm.session", value, base);
}

function clearSessionCookie(res: NextResponse) {
  const base = { path: "/" as const, maxAge: 0 };
  const domain = process.env.COOKIE_DOMAIN?.trim();
  if (domain) res.cookies.set("tm.session", "", { ...base, domain });
  else res.cookies.set("tm.session", "", base);
}

function isApiBody(v: unknown): v is ApiBody {
  if (!v || typeof v !== "object") return false;
  const action = (v as { action?: string }).action;
  return action === "login" || action === "setPassword" || action === "resetSeed" || action === "logout";
}

/** Só cria usuários iniciais se ainda não existirem (não sobrescreve time/papel/senha em produção). */
async function seedUsersToDb() {
  for (const u of SEED_USERS) {
    const login = norm(u.login);

    const existing = await prisma.user.findUnique({
      where: { login },
      select: { id: true },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          login,
          name: u.name,
          email: u.email,
          team: login === norm("jephesson") ? TEAM_JEPHESSON : TEAM_LF,
          role: u.role,
          passwordHash: sha256(u.password),
        },
      });
    }
  }
}

export async function GET(): Promise<NextResponse> {
  // ping + garante seed (pra não “sumir” usuário)
  await seedUsersToDb();
  return NextResponse.json({ ok: true, ping: true }, { headers: noCacheHeaders() });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw = await req.json().catch(() => null);
    if (!isApiBody(raw)) {
      return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400, headers: noCacheHeaders() });
    }

    if (raw.action === "resetSeed") {
      await seedUsersToDb();
      return NextResponse.json({ ok: true, message: "Seed restaurado" }, { headers: noCacheHeaders() });
    }

    if (raw.action === "login") {
      await seedUsersToDb();

      const login = norm(raw.login);
      const password = String(raw.password ?? "");
      if (!login || !password) {
        return NextResponse.json(
          { ok: false, error: "Campos obrigatórios ausentes" },
          { status: 400, headers: noCacheHeaders() }
        );
      }

      const dbUser = await prisma.user.findUnique({ where: { login } });
      if (!dbUser) {
        return NextResponse.json(
          { ok: false, error: "Usuário não encontrado" },
          { status: 401, headers: noCacheHeaders() }
        );
      }

      if (dbUser.passwordHash !== sha256(password)) {
        return NextResponse.json({ ok: false, error: "Senha inválida" }, { status: 401, headers: noCacheHeaders() });
      }

      let sessionUser = dbUser;
      if (login === norm("jephesson")) {
        await prisma.user.update({
          where: { login },
          data: { team: TEAM_JEPHESSON },
        });
        const fresh = await prisma.user.findUnique({ where: { login } });
        if (fresh) sessionUser = fresh;
      }

      const res = NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
      setSessionCookie(res, {
        id: sessionUser.id,
        login: sessionUser.login,
        role: (sessionUser.role === "admin" || sessionUser.role === "staff" || sessionUser.role === "developer"
          ? sessionUser.role
          : "staff") as Role,
        team: sessionUser.team,
        name: sessionUser.name,
        email: sessionUser.email ?? null,
      });
      return res;
    }

    if (raw.action === "setPassword") {
      await seedUsersToDb();

      const login = norm(raw.login);
      const password = String(raw.password ?? "");
      if (!login || !password) {
        return NextResponse.json(
          { ok: false, error: "Campos obrigatórios ausentes" },
          { status: 400, headers: noCacheHeaders() }
        );
      }

      await prisma.user.update({
        where: { login },
        data: { passwordHash: sha256(password) },
      });

      return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
    }

    if (raw.action === "logout") {
      const res = NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
      clearSessionCookie(res);
      return res;
    }

    return NextResponse.json({ ok: false, error: "Ação desconhecida" }, { status: 400, headers: noCacheHeaders() });
  } catch (err) {
    console.error("Erro /api/auth:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCacheHeaders() });
  }
}
