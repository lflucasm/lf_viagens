// app/api/funcionarios/[id]/password/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const oldPassword = typeof body?.oldPassword === "string" ? body.oldPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const newPassword2 = typeof body?.newPassword2 === "string" ? body.newPassword2 : "";

  if (!oldPassword || !newPassword || !newPassword2) {
    return NextResponse.json({ ok: false, error: "Preencha senha antiga e a nova duas vezes." }, { status: 400, headers: noCacheHeaders() });
  }
  if (newPassword.trim().length < 6) {
    return NextResponse.json({ ok: false, error: "Nova senha deve ter pelo menos 6 caracteres." }, { status: 400, headers: noCacheHeaders() });
  }
  if (newPassword !== newPassword2) {
    return NextResponse.json({ ok: false, error: "As novas senhas não conferem." }, { status: 400, headers: noCacheHeaders() });
  }

  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, passwordHash: true } });
  if (!u) return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404, headers: noCacheHeaders() });

  if (u.passwordHash !== sha256(oldPassword)) {
    return NextResponse.json({ ok: false, error: "Senha antiga incorreta." }, { status: 401, headers: noCacheHeaders() });
  }

  await prisma.user.update({
    where: { id },
    data: { passwordHash: sha256(newPassword) },
  });

  return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
}
