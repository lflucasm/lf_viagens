// app/api/funcionarios/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "staff";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

function slugifyId(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9. _-]/g, "")
    .replace(/\s+/g, ".")
    .replace(/-+/g, "-");
}

// =========================
// GET /api/funcionarios
// =========================
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        login: true,
        name: true,
        cpf: true,
        employeeId: true, // ✅
        role: true,
        team: true,
        createdAt: true,
        employeeInvite: { select: { code: true, isActive: true } },
        _count: { select: { cedentesOwned: true } },
      },
    });

    const data = users.map((u) => ({
      id: u.id,
      name: u.name,
      login: u.login,
      cpf: u.cpf,
      employeeId: u.employeeId ?? null,
      team: u.team,
      role: u.role,
      createdAt: u.createdAt,
      inviteCode: u.employeeInvite?.code ?? null,
      _count: { cedentes: u._count.cedentesOwned },
    }));

    return NextResponse.json({ ok: true, data }, { headers: noCacheHeaders() });
  } catch (e: any) {
    console.error("Erro /api/funcionarios:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar funcionários" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

// =========================
// POST /api/funcionarios
// (CRIA SÓ O USUÁRIO - SEM CONVITE)
// =========================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const login = norm(body?.login);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const cpf = typeof body?.cpf === "string" ? onlyDigits(body.cpf) : "";
    const employeeIdRaw = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    const employeeId = slugifyId(employeeIdRaw);

    const email = typeof body?.email === "string" ? body.email.trim() : null;
    const team = typeof body?.team === "string" && body.team.trim() ? body.team.trim() : "@vias_aereas";
    const role: Role = body?.role === "admin" ? "admin" : "staff";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!login || !name || !password) {
      return NextResponse.json(
        { ok: false, error: "Informe login, nome e senha." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (!employeeId) {
      return NextResponse.json(
        { ok: false, error: "Informe o ID do funcionário (ex: eduarda.freitas)." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (password.trim().length < 6) {
      return NextResponse.json(
        { ok: false, error: "Senha deve ter pelo menos 6 caracteres." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const exists = await prisma.user.findUnique({ where: { login } });
    if (exists) {
      return NextResponse.json(
        { ok: false, error: "Já existe um usuário com esse login." },
        { status: 409, headers: noCacheHeaders() }
      );
    }

    // se employeeId for @unique no prisma, já vai garantir; mas tratamos erro também
    const user = await prisma.user.create({
      data: {
        login,
        name,
        cpf: cpf ? cpf : null,
        employeeId, // ✅
        email,
        team,
        role,
        passwordHash: sha256(password),
      },
      select: {
        id: true,
        name: true,
        login: true,
        cpf: true,
        employeeId: true,
        team: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...user,
          inviteCode: null, // ✅ convite só no editar
        },
      },
      { status: 201, headers: noCacheHeaders() }
    );
  } catch (e: any) {
    console.error("Erro POST /api/funcionarios:", e);

    // erro de unique
    if (e?.code === "P2002") {
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(", ") : String(e?.meta?.target || "");
      const msg =
        target.includes("employeeId") ? "Esse ID já está em uso." :
        target.includes("login") ? "Esse login já está em uso." :
        "Campo único já está em uso.";
      return NextResponse.json({ ok: false, error: msg }, { status: 409, headers: noCacheHeaders() });
    }

    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar funcionário" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
