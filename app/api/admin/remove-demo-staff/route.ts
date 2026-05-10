import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";
import {
  DEFAULT_DEMO_STAFF_LOGINS,
  removeStaffUsersByLogins,
} from "@/lib/remove-staff-by-logins";

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

/**
 * POST — admin: remove contas `eduarda`, `paola`, `lucas` (login curto), com realocação para `lucas_fellype` ou para o admin logado.
 * Body opcional: `{ "logins": ["eduarda", "paola", "lucas"] }`
 */
export async function POST(req: NextRequest) {
  let sess;
  try {
    sess = await requireAdminSession();
  } catch (e) {
    const r = authErr(e);
    if (r) return r;
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const rawList = body?.logins;
  const logins: string[] = Array.isArray(rawList)
    ? rawList.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
    : [...DEFAULT_DEMO_STAFF_LOGINS];

  const primary = await prisma.user.findUnique({
    where: { login: "lucas_fellype" },
    select: { id: true },
  });
  const reassignmentUserId = primary?.id ?? sess.id;

  const data = await removeStaffUsersByLogins({
    logins,
    reassignmentUserId,
    actingUserId: sess.id,
  });

  return NextResponse.json(
    {
      ok: true,
      data,
      message:
        data.errors.length === 0
          ? "Processamento concluído."
          : "Concluído com erros em alguns logins — veja `data.errors`.",
    },
    { headers: headers() }
  );
}
