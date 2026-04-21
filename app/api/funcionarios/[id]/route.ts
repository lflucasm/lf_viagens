// app/api/funcionarios/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      login: true,
      name: true,
      cpf: true,
      employeeId: true,
      role: true,
      team: true,
      createdAt: true,
      employeeInvite: { select: { code: true, isActive: true } },
      _count: { select: { cedentesOwned: true } },
    },
  });

  if (!u) return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404, headers: noCacheHeaders() });

  return NextResponse.json(
    {
      ok: true,
      data: {
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
      },
    },
    { headers: noCacheHeaders() }
  );
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  const cpf = typeof body?.cpf === "string" ? onlyDigits(body.cpf) : "";
  const employeeIdRaw = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
  const employeeId = slugifyId(employeeIdRaw);

  if (!name || !login || !employeeId) {
    return NextResponse.json({ ok: false, error: "Nome, login e ID são obrigatórios." }, { status: 400, headers: noCacheHeaders() });
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        login,
        cpf: cpf ? cpf : null,
        employeeId,
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
        employeeInvite: { select: { code: true } },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: updated.id,
          name: updated.name,
          login: updated.login,
          cpf: updated.cpf,
          employeeId: updated.employeeId ?? null,
          team: updated.team,
          role: updated.role,
          createdAt: updated.createdAt,
          inviteCode: updated.employeeInvite?.code ?? null,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Login ou ID já está em uso." }, { status: 409, headers: noCacheHeaders() });
    }
    console.error("Erro PATCH /api/funcionarios/[id]:", e);
    return NextResponse.json({ ok: false, error: "Erro ao atualizar funcionário." }, { status: 500, headers: noCacheHeaders() });
  }
}
