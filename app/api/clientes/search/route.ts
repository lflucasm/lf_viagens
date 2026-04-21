// app/api/clientes/search/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    const recent = searchParams.get("recent") === "1";
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || "20")));

    const mode = Prisma.QueryMode.insensitive;

    // recentes
    if (recent || q.length < 2) {
      const clientes = await prisma.cliente.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          identificador: true,
          nome: true,
          cpfCnpj: true,
          telefone: true,
          affiliateId: true,
          affiliate: {
            select: {
              id: true,
              name: true,
              commissionBps: true,
              isActive: true,
            },
          },
        },
      });

      return NextResponse.json({ ok: true, clientes });
    }

    const digits = onlyDigits(q);

    const where: Prisma.ClienteWhereInput = {
      OR: [
        { nome: { contains: q, mode } },
        { identificador: { contains: q, mode } },
        { affiliate: { name: { contains: q, mode } } },
        ...(digits
          ? [
              { cpfCnpj: { contains: digits } },
              { telefone: { contains: digits } },
            ]
          : []),
      ],
    };

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        identificador: true,
        nome: true,
        cpfCnpj: true,
        telefone: true,
        affiliateId: true,
        affiliate: {
          select: {
            id: true,
            name: true,
            commissionBps: true,
            isActive: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, clientes });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Erro ao buscar clientes.") },
      { status: 500 }
    );
  }
}
