// app/api/clientes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D+/g, "");
}

function cleanCpfCnpj(v: unknown) {
  const d = onlyDigits(v);
  if (!d) return null;
  // aceita 11 (CPF) ou 14 (CNPJ), senão rejeita
  if (d.length !== 11 && d.length !== 14) return "__INVALID__";
  return d;
}

function cleanTelefone(v: unknown) {
  const d = onlyDigits(v);
  if (!d) return null;
  // deixa flexível: 10-13 (com DDI etc)
  if (d.length < 10 || d.length > 13) return "__INVALID__";
  return d;
}

const TIPOS = ["PESSOA", "EMPRESA"] as const;
const ORIGENS = ["BALCAO_MILHAS", "PARTICULAR", "SITE", "OUTROS"] as const;

type ClienteTipo = (typeof TIPOS)[number];
type ClienteOrigem = (typeof ORIGENS)[number];

function isTipo(v: unknown): v is ClienteTipo {
  return TIPOS.includes(String(v) as ClienteTipo);
}
function isOrigem(v: unknown): v is ClienteOrigem {
  return ORIGENS.includes(String(v) as ClienteOrigem);
}

function pad5(n: number) {
  return String(n).padStart(5, "0");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function GET(req: NextRequest) {
  try {
    // opcional: filtro simples por q
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limitParam = (searchParams.get("limit") || "").trim().toLowerCase();
    const limitRaw = Number(limitParam || "100");
    const useAll = limitParam === "all";
    const limit = Math.min(5000, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 100));
    const qDigits = onlyDigits(q);

    const where = q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" as const } },
            { identificador: { contains: q, mode: "insensitive" as const } },
            { affiliate: { name: { contains: q, mode: "insensitive" as const } } },
            ...(qDigits
              ? [
                  { cpfCnpj: { contains: qDigits, mode: "insensitive" as const } },
                  { telefone: { contains: qDigits, mode: "insensitive" as const } },
                ]
              : []),
          ],
        }
      : {};

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(useAll ? {} : { take: limit }),
      select: {
        id: true,
        identificador: true,
        tipo: true,
        nome: true,
        cpfCnpj: true,
        telefone: true,
        origem: true,
        origemDescricao: true,
        affiliateId: true,
        affiliate: {
          select: {
            id: true,
            name: true,
            document: true,
            commissionBps: true,
            isActive: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: { clientes } }, { status: 200 });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Erro ao listar clientes.") },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionServer();
    const userId = String(session?.id || "");
    const team = String(session?.team || "");
    if (!userId || !team) {
      return NextResponse.json(
        { ok: false, error: "Sessão inválida: faça login novamente." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const tipo: ClienteTipo = isTipo(body.tipo) ? body.tipo : "PESSOA";

    const nome = String(body.nome ?? "").trim();
    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome (ou empresa)." },
        { status: 400 }
      );
    }

    const origem: ClienteOrigem | null = isOrigem(body.origem) ? body.origem : null;
    if (!origem) {
      return NextResponse.json(
        { ok: false, error: "Informe a origem." },
        { status: 400 }
      );
    }

    const origemDescricao = String(body.origemDescricao ?? "").trim() || null;
    if (origem === "OUTROS" && !origemDescricao) {
      return NextResponse.json(
        { ok: false, error: "Em 'Outros', descreva a origem." },
        { status: 400 }
      );
    }

    const cpfCnpj = cleanCpfCnpj(body.cpfCnpj);
    if (cpfCnpj === "__INVALID__") {
      return NextResponse.json(
        { ok: false, error: "CPF/CNPJ inválido (use 11 ou 14 dígitos)." },
        { status: 400 }
      );
    }

    const telefone = cleanTelefone(body.telefone);
    if (telefone === "__INVALID__") {
      return NextResponse.json(
        { ok: false, error: "Telefone inválido." },
        { status: 400 }
      );
    }

    const affiliateId = String(body.affiliateId ?? "").trim() || null;
    if (affiliateId) {
      const affiliate = await prisma.affiliate.findFirst({
        where: { id: affiliateId, team, isActive: true },
        select: { id: true },
      });
      if (!affiliate) {
        return NextResponse.json(
          { ok: false, error: "Afiliado de indicação inválido ou inativo." },
          { status: 400 }
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      // contador sequencial CL00001
      const counter = await tx.counter.upsert({
        where: { key: "cliente" },
        create: { key: "cliente", value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });

      const identificador = `CL${pad5(counter.value)}`;

      const cliente = await tx.cliente.create({
        data: {
          identificador,
          tipo,
          nome,
          cpfCnpj,
          telefone,
          origem,
          origemDescricao: origem === "OUTROS" ? origemDescricao : null,
          affiliateId,
          createdById: userId,
        },
        select: {
          id: true,
          identificador: true,
          tipo: true,
          nome: true,
          cpfCnpj: true,
          telefone: true,
          origem: true,
          origemDescricao: true,
          affiliateId: true,
          affiliate: {
            select: {
              id: true,
              name: true,
              document: true,
              commissionBps: true,
              isActive: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });

      return cliente;
    });

    return NextResponse.json({ ok: true, data: { cliente: created } }, { status: 201 });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Erro ao criar cliente.") },
      { status: 500 }
    );
  }
}
