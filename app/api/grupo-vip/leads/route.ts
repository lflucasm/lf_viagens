import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

    const url = new URL(req.url);
    const status = String(url.searchParams.get("status") || "ALL").toUpperCase();
    const q = String(url.searchParams.get("q") || "").trim();

    const where: {
      team: string;
      status?: "PENDING" | "APPROVED" | "REJECTED";
      OR?: Array<
        | { fullName: { contains: string; mode: "insensitive" } }
        | { whatsappE164: { contains: string } }
        | { employee: { name: { contains: string; mode: "insensitive" } } }
        | { employee: { login: { contains: string; mode: "insensitive" } } }
      >;
    } = { team };

    if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") {
      where.status = status;
    }

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { whatsappE164: { contains: q.replace(/\s+/g, "") } },
        { employee: { name: { contains: q, mode: "insensitive" } } },
        { employee: { login: { contains: q, mode: "insensitive" } } },
      ];
    }

    const leads = await prisma.vipWhatsappLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { id: true, name: true, login: true } },
        approvedBy: { select: { id: true, name: true, login: true } },
        link: { select: { id: true, code: true, whatsappE164: true, isActive: true } },
        payments: {
          orderBy: { paidAt: "desc" },
          include: {
            recordedBy: { select: { id: true, name: true, login: true } },
          },
        },
      },
    });

    const data = leads.map((lead) => {
      const totalPaidCents = lead.payments.reduce((acc, p) => acc + (p.amountCents || 0), 0);
      return {
        id: lead.id,
        fullName: lead.fullName,
        birthDate: lead.birthDate.toISOString(),
        countryCode: lead.countryCode,
        areaCode: lead.areaCode,
        phoneNumber: lead.phoneNumber,
        whatsappE164: lead.whatsappE164,
        originAirport: lead.originAirport,
        destinationAirport1: lead.destinationAirport1,
        destinationAirport2: lead.destinationAirport2,
        destinationAirport3: lead.destinationAirport3,
        firstMonthCents: lead.firstMonthCents,
        recurringMonthCents: lead.recurringMonthCents,
        status: lead.status,
        approvedAt: lead.approvedAt?.toISOString() || null,
        approvedBy: lead.approvedBy
          ? {
              id: lead.approvedBy.id,
              name: lead.approvedBy.name,
              login: lead.approvedBy.login,
            }
          : null,
        internalNotes: lead.internalNotes,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        employee: {
          id: lead.employee.id,
          name: lead.employee.name,
          login: lead.employee.login,
        },
        link: {
          id: lead.link.id,
          code: lead.link.code,
          whatsappE164: lead.link.whatsappE164,
          isActive: lead.link.isActive,
        },
        totals: {
          totalPaidCents,
          paymentsCount: lead.payments.length,
        },
        payments: lead.payments.map((p) => ({
          id: p.id,
          monthRef: p.monthRef,
          amountCents: p.amountCents,
          note: p.note,
          paidAt: p.paidAt.toISOString(),
          recordedBy: p.recordedBy
            ? {
                id: p.recordedBy.id,
                name: p.recordedBy.name,
                login: p.recordedBy.login,
              }
            : null,
        })),
      };
    });

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao carregar cadastros do Grupo VIP.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
