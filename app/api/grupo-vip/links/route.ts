import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { digitsOnly, generateVipCode } from "@/lib/vip-whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeE164(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const digits = digitsOnly(raw);
  if (!digits) return "";
  return `+${digits}`;
}

async function createLinkWithUniqueCode(params: {
  team: string;
  employeeId: string;
  whatsappE164: string;
  isActive: boolean;
}) {
  let lastErr: unknown = null;
  for (let i = 0; i < 8; i++) {
    try {
      return await prisma.vipWhatsappLink.create({
        data: {
          team: params.team,
          employeeId: params.employeeId,
          whatsappE164: params.whatsappE164,
          isActive: params.isActive,
          code: generateVipCode(),
        },
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Falha ao gerar código do link.");
}

export async function GET() {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

    const [employees, links] = await Promise.all([
      prisma.user.findMany({
        where: { team },
        select: { id: true, name: true, login: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.vipWhatsappLink.findMany({
        where: { team },
        select: {
          id: true,
          employeeId: true,
          code: true,
          whatsappE164: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const byEmployee = new Map(links.map((l) => [l.employeeId, l]));

    const data = employees.map((u) => ({
      employee: {
        id: u.id,
        name: u.name,
        login: u.login,
        role: u.role,
      },
      link: byEmployee.get(u.id)
        ? {
            id: byEmployee.get(u.id)!.id,
            code: byEmployee.get(u.id)!.code,
            whatsappE164: byEmployee.get(u.id)!.whatsappE164,
            isActive: byEmployee.get(u.id)!.isActive,
            createdAt: byEmployee.get(u.id)!.createdAt.toISOString(),
            updatedAt: byEmployee.get(u.id)!.updatedAt.toISOString(),
          }
        : null,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao carregar links do Grupo VIP.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const employeeId = String(body.employeeId || "").trim();
    const whatsappE164 = normalizeE164(String(body.whatsappE164 || ""));
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: "employeeId é obrigatório." }, { status: 400 });
    }
    if (!whatsappE164 || digitsOnly(whatsappE164).length < 10) {
      return NextResponse.json(
        { ok: false, error: "Informe WhatsApp do funcionário no formato +55DDDNUMERO." },
        { status: 400 }
      );
    }

    const employee = await prisma.user.findFirst({
      where: { id: employeeId, team },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ ok: false, error: "Funcionário não encontrado no seu time." }, { status: 404 });
    }

    const existing = await prisma.vipWhatsappLink.findFirst({
      where: { team, employeeId },
      select: { id: true },
    });

    const link = existing
      ? await prisma.vipWhatsappLink.update({
          where: { id: existing.id },
          data: { whatsappE164, isActive },
        })
      : await createLinkWithUniqueCode({ team, employeeId, whatsappE164, isActive });

    return NextResponse.json({
      ok: true,
      data: {
        id: link.id,
        employeeId: link.employeeId,
        code: link.code,
        whatsappE164: link.whatsappE164,
        isActive: link.isActive,
        createdAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao salvar link do Grupo VIP.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
