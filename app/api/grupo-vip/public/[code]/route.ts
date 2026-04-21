import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  VIP_FIRST_MONTH_CENTS,
  VIP_PIX_KEY,
  VIP_PIX_LABEL,
  VIP_RECURRING_MONTH_CENTS,
  buildEmployeeWhatsappMessage,
  buildWhatsappSendUrl,
  digitsOnly,
  normalizeAirportCode,
  toE164,
} from "@/lib/vip-whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseBirthDate(input: unknown) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const md = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (md) {
    const year = Number(md[1]);
    const month = Number(md[2]);
    const day = Number(md[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    if (year < 1900 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseText(input: unknown, max = 200) {
  const value = String(input || "").trim();
  if (!value) return "";
  return value.slice(0, max);
}

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

async function getLinkByCode(code: string) {
  return prisma.vipWhatsappLink.findFirst({
    where: { code, isActive: true },
    include: {
      employee: {
        select: { id: true, name: true, login: true, team: true },
      },
    },
  });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const safeCode = parseText(code, 64).toLowerCase();
    if (!safeCode) {
      return NextResponse.json(
        { ok: false, error: "Link inválido." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    const link = await getLinkByCode(safeCode);
    if (!link) {
      return NextResponse.json(
        { ok: false, error: "Link não encontrado ou inativo." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          code: link.code,
          employee: {
            id: link.employee.id,
            name: link.employee.name,
            login: link.employee.login,
          },
          pricing: {
            firstMonthCents: VIP_FIRST_MONTH_CENTS,
            recurringMonthCents: VIP_RECURRING_MONTH_CENTS,
          },
          pix: {
            key: VIP_PIX_KEY,
            label: VIP_PIX_LABEL,
          },
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao carregar página de cadastro.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const safeCode = parseText(code, 64).toLowerCase();
    if (!safeCode) {
      return NextResponse.json(
        { ok: false, error: "Link inválido." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    const link = await getLinkByCode(safeCode);
    if (!link) {
      return NextResponse.json(
        { ok: false, error: "Link não encontrado ou inativo." },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const fullName = parseText(body.fullName, 160);
    const birthDate = parseBirthDate(body.birthDate);
    const countryCode = digitsOnly(parseText(body.countryCode, 5)).slice(0, 4);
    const areaCode = digitsOnly(parseText(body.areaCode, 5)).slice(0, 4);
    const phoneNumber = digitsOnly(parseText(body.phoneNumber, 16)).slice(0, 12);

    const originAirport = normalizeAirportCode(parseText(body.originAirport, 10));
    const destinationAirport1 = normalizeAirportCode(
      parseText(body.destinationAirport1, 10)
    );
    const destinationAirport2 = normalizeAirportCode(
      parseText(body.destinationAirport2, 10)
    );
    const destinationAirport3 = normalizeAirportCode(
      parseText(body.destinationAirport3, 10)
    );
    const termsAccepted = body.termsAccepted === true;

    if (fullName.length < 3) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome completo." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (!birthDate) {
      return NextResponse.json(
        { ok: false, error: "Informe uma data de nascimento válida." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const now = new Date();
    if (birthDate.getTime() > now.getTime()) {
      return NextResponse.json(
        { ok: false, error: "Data de nascimento não pode ser no futuro." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (!countryCode || !areaCode || !phoneNumber) {
      return NextResponse.json(
        { ok: false, error: "Preencha código do país, DDD e número do WhatsApp." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { ok: false, error: "Você precisa aceitar os termos de adesão." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const whatsappE164 = toE164(countryCode, areaCode, phoneNumber);
    const e164Digits = digitsOnly(whatsappE164);
    if (e164Digits.length < 10 || e164Digits.length > 15) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp inválido." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const airports = [
      originAirport,
      destinationAirport1,
      destinationAirport2,
      destinationAirport3,
    ];
    if (airports.some((a) => a.length !== 3)) {
      return NextResponse.json(
        { ok: false, error: "Selecione aeroportos válidos (código IATA)." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (
      new Set([
        destinationAirport1,
        destinationAirport2,
        destinationAirport3,
      ]).size < 3
    ) {
      return NextResponse.json(
        { ok: false, error: "Os 3 destinos devem ser diferentes." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const lead = await prisma.vipWhatsappLead.create({
      data: {
        team: link.team,
        linkId: link.id,
        employeeId: link.employeeId,
        fullName,
        birthDate,
        countryCode,
        areaCode,
        phoneNumber,
        whatsappE164,
        originAirport,
        destinationAirport1,
        destinationAirport2,
        destinationAirport3,
        firstMonthCents: VIP_FIRST_MONTH_CENTS,
        recurringMonthCents: VIP_RECURRING_MONTH_CENTS,
        status: "PENDING",
      },
    });

    const whatsappMessage = buildEmployeeWhatsappMessage({
      employeeName: link.employee.name,
      employeeLogin: link.employee.login,
      fullName,
      birthDate,
      whatsappE164,
      originAirport,
      destinationAirport1,
      destinationAirport2,
      destinationAirport3,
      adhesionDate: lead.createdAt,
    });

    const employeeWhatsappUrl = buildWhatsappSendUrl(
      link.whatsappE164,
      whatsappMessage
    );

    return NextResponse.json(
      {
        ok: true,
        data: {
          lead: {
            id: lead.id,
            status: lead.status,
            createdAt: lead.createdAt.toISOString(),
            fullName: lead.fullName,
          },
          employee: {
            id: link.employee.id,
            name: link.employee.name,
            login: link.employee.login,
          },
          employeeWhatsappUrl,
          employeeWhatsappMessage: whatsappMessage,
          pix: {
            key: VIP_PIX_KEY,
            label: VIP_PIX_LABEL,
          },
          pricing: {
            firstMonthCents: VIP_FIRST_MONTH_CENTS,
            recurringMonthCents: VIP_RECURRING_MONTH_CENTS,
          },
        },
      },
      { status: 201, headers: noCacheHeaders() }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao enviar cadastro.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
