import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAppSettingsAndIndicacaoForms } from "@/lib/app-settings-ensure";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function authErr(e: unknown) {
  const err = e as { message?: string; code?: string };
  if (err?.message === "UNAUTHENTICATED" || err?.code === "UNAUTHENTICATED") {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: headers() });
  }
  if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
    return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403, headers: headers() });
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
  } catch (e) {
    const r = authErr(e);
    if (r) return r;
    throw e;
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  await ensureAppSettingsAndIndicacaoForms();

  const existing = await prisma.cedenteIndicacaoForm.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Formulário não encontrado." }, { status: 404, headers: headers() });
  }

  const title = body?.title != null ? String(body.title).trim() : undefined;
  const termVersion = body?.termVersion != null ? String(body.termVersion).trim() : undefined;
  const termBody = body?.termBody != null ? String(body.termBody).trim() : undefined;
  const slug = body?.slug != null ? String(body.slug).trim().toLowerCase() : undefined;
  const sortOrder = body?.sortOrder != null ? Number(body.sortOrder) : undefined;
  const isActive = body?.isActive != null ? Boolean(body.isActive) : undefined;

  if (title === "" || termVersion === "" || termBody === "" || slug === "") {
    return NextResponse.json({ ok: false, error: "Campos não podem ficar vazios." }, { status: 400, headers: headers() });
  }

  if (slug && slug !== existing.slug) {
    const taken = await prisma.cedenteIndicacaoForm.findFirst({
      where: { slug, id: { not: id } },
    });
    if (taken) {
      return NextResponse.json({ ok: false, error: "Slug já em uso." }, { status: 409, headers: headers() });
    }
  }

  try {
    const updated = await prisma.cedenteIndicacaoForm.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(termVersion !== undefined ? { termVersion } : {}),
        ...(termBody !== undefined ? { termBody } : {}),
        ...(Number.isFinite(sortOrder) ? { sortOrder: Math.trunc(sortOrder as number) } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    return NextResponse.json({ ok: true, data: updated }, { headers: headers() });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Versão do termo ou slug duplicado." },
        { status: 409, headers: headers() }
      );
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
  } catch (e) {
    const r = authErr(e);
    if (r) return r;
    throw e;
  }

  const { id } = await params;
  await ensureAppSettingsAndIndicacaoForms();

  const count = await prisma.cedenteIndicacaoForm.count();
  if (count <= 1) {
    return NextResponse.json(
      { ok: false, error: "Mantenha ao menos um formulário de indicação." },
      { status: 400, headers: headers() }
    );
  }

  await prisma.cedenteIndicacaoForm.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { headers: headers() });
}
