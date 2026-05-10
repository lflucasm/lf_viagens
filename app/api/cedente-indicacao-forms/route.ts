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

function slugifyBase(title: string) {
  const s = title
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "formulario";
}

async function uniqueSlug(base: string) {
  let slug = base;
  let n = 0;
  while (await prisma.cedenteIndicacaoForm.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
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

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch (e) {
    const r = authErr(e);
    if (r) return r;
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  const termVersion = String(body?.termVersion || "").trim();
  const termBody = String(body?.termBody || "").trim();
  let slug = String(body?.slug || "").trim().toLowerCase();

  if (!title || !termVersion || !termBody) {
    return NextResponse.json(
      { ok: false, error: "Título, versão do termo e texto são obrigatórios." },
      { status: 400, headers: headers() }
    );
  }

  await ensureAppSettingsAndIndicacaoForms();

  if (!slug) slug = await uniqueSlug(slugifyBase(title));
  else {
    const taken = await prisma.cedenteIndicacaoForm.findUnique({ where: { slug } });
    if (taken) {
      return NextResponse.json({ ok: false, error: "Slug já em uso. Escolha outro." }, { status: 409, headers: headers() });
    }
  }

  const maxOrder = await prisma.cedenteIndicacaoForm.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  try {
    const created = await prisma.cedenteIndicacaoForm.create({
      data: {
        title,
        slug,
        termVersion,
        termBody,
        sortOrder,
        isActive: body?.isActive !== false,
      },
    });
    return NextResponse.json({ ok: true, data: created }, { status: 201, headers: headers() });
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
