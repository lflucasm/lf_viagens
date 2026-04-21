// app/api/funcionarios/[id]/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function slugify(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function baseCodeFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || "user";
  const second = parts[1] || "convite";
  return slugify(`${first}-${second}`);
}

async function makeUniqueCode(base: string) {
  // tenta base, depois base-2, base-3...
  for (let n = 0; n < 50; n++) {
    const code = n === 0 ? base : `${base}-${n + 1}`;
    const exists = await prisma.employeeInvite.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Não foi possível gerar um código único.");
}

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404 });
  }

  try {
    const base = baseCodeFromName(user.name);
    const code = await makeUniqueCode(base);

    const invite = await prisma.employeeInvite.upsert({
      where: { userId: user.id },
      update: { code, isActive: true },
      create: { userId: user.id, code, isActive: true },
      select: { code: true },
    });

    return NextResponse.json({ ok: true, code: invite.code });
  } catch (e: any) {
    console.error("Erro gerar convite:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao gerar convite." }, { status: 500 });
  }
}
