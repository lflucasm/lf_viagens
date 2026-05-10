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

function asString(v: unknown, max: number) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export async function GET() {
  try {
    await requireAdminSession();
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    if (err?.message === "UNAUTHENTICATED" || err?.code === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: headers() });
    }
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403, headers: headers() });
    }
    throw e;
  }

  await ensureAppSettingsAndIndicacaoForms();
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "default" } });
  const indicacaoForms = await prisma.cedenteIndicacaoForm.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({ ok: true, data: { settings, indicacaoForms } }, { headers: headers() });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    if (err?.message === "UNAUTHENTICATED" || err?.code === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: headers() });
    }
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403, headers: headers() });
    }
    throw e;
  }

  const body = await req.json().catch(() => ({}));

  const companyDisplayName = asString(body?.companyDisplayName, 120);
  const companyLegalName = asString(body?.companyLegalName, 240);
  const cnpj = asString(body?.cnpj, 32);
  let instagramHandle = asString(body?.instagramHandle, 80);
  if (instagramHandle) instagramHandle = instagramHandle.replace(/^@/, "");
  const phoneDisplay = asString(body?.phoneDisplay, 40);
  const whatsappDigits = asString(body?.whatsappDigits, 20);

  if (!companyDisplayName || !companyLegalName || !cnpj || !instagramHandle || !phoneDisplay || !whatsappDigits) {
    return NextResponse.json(
      { ok: false, error: "Preencha nome fantasia, razão social, CNPJ, Instagram, telefone e WhatsApp." },
      { status: 400, headers: headers() }
    );
  }

  await ensureAppSettingsAndIndicacaoForms();
  const settings = await prisma.appSettings.update({
    where: { id: "default" },
    data: {
      companyDisplayName,
      companyLegalName,
      cnpj,
      instagramHandle,
      phoneDisplay,
      whatsappDigits: whatsappDigits.replace(/\D+/g, ""),
    },
  });

  return NextResponse.json({ ok: true, data: { settings } }, { headers: headers() });
}
