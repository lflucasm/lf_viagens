// app/api/compras/route.ts
import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";
import { nextNumeroCompra } from "@/lib/compraNumero";
import { recomputeCompra } from "@/lib/compras";
import { Prisma, LoyaltyProgram } from "@prisma/client";

export const dynamic = "force-dynamic";

function asInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

/**
 * Normaliza uma "purchase" do Prisma para o shape esperado pelo ComprasClient
 * (compat com campos antigos/novos)
 */
function toPurchaseRow(
  p: any,
  overrides?: {
    ciaPointsTotal?: number;
  }
) {
  const row = {
    id: p.id,
    numero: p.numero,
    status: p.status,
    createdAt: p.createdAt, // Date -> JSON vira ISO automaticamente

    // ✅ compat no OUTPUT (a UI espera "ciaProgram")
    // No Prisma/DB o campo é "ciaAerea"
    ciaProgram: (p.ciaAerea ?? (p as any).ciaProgram ?? null) as LoyaltyProgram | null,
    ciaPointsTotal: asInt((p as any).ciaPointsTotal ?? p.pontosCiaTotal ?? 0),

    // totals (compat com nomes diferentes)
    totalCostCents: asInt((p as any).totalCostCents ?? p.totalCost ?? p.totalCents ?? 0),

    cedente: p.cedente
      ? {
          id: p.cedente.id,
          nomeCompleto: p.cedente.nomeCompleto,
          cpf: p.cedente.cpf,
          identificador: p.cedente.identificador,
        }
      : null,
  };

  if (typeof overrides?.ciaPointsTotal === "number") {
    row.ciaPointsTotal = asInt(overrides.ciaPointsTotal, row.ciaPointsTotal);
  }

  return row;
}

function normQ(v?: string | null) {
  const s = String(v || "").trim();
  return s.length ? s : "";
}

function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

function normalizeEnumQ(q: string): LoyaltyProgram | null {
  const up = (q || "").trim().toUpperCase();

  // atalhos comuns (se tu digitar "GOL", ele vira SMILES)
  if (up === "GOL") return "SMILES";

  if (up === "LATAM" || up === "SMILES" || up === "LIVELO" || up === "ESFERA") {
    return up as LoyaltyProgram;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const cedenteId = searchParams.get("cedenteId") || undefined;
    const status = searchParams.get("status") || undefined;

    // ✅ busca do frontend (?q=...)
    const q = normQ(searchParams.get("q"));

    // ✅ cursor pagination
    const take = Math.min(asInt(searchParams.get("take") || 50, 50), 200);
    const cursor = searchParams.get("cursor") || null;

    // mantém compat (se alguém ainda usar offset)
    const skipFallback = Math.max(0, asInt(searchParams.get("skip") || 0, 0));

    const qDigits = q ? digitsOnly(q) : "";
    const qProgram = q ? normalizeEnumQ(q) : null;

    // ✅ where base
    const where: Prisma.PurchaseWhereInput = {
      ...(cedenteId ? { cedenteId } : {}),
      ...(status ? { status: status as any } : {}),
    };

    // ✅ filtro de busca (aditivo)
    if (q) {
      const or: Prisma.PurchaseWhereInput[] = [
        { numero: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },

        // ✅ ciaAerea é ENUM -> só equals quando q bater com um enum válido
        ...(qProgram ? [{ ciaAerea: { equals: qProgram } }] : []),

        // cedente (relacionamento)
        { cedente: { is: { nomeCompleto: { contains: q, mode: "insensitive" } } } },
        { cedente: { is: { identificador: { contains: q, mode: "insensitive" } } } },
      ];

      if (qDigits.length >= 2) {
        or.push({ cedente: { is: { cpf: { contains: qDigits } } } });
        or.push({
          cedente: { is: { identificador: { contains: qDigits, mode: "insensitive" } } },
        });
      }

      where.OR = or;
    }

    // ✅ importante: orderBy estável para cursor pagination
    const orderBy: Prisma.PurchaseOrderByWithRelationInput[] = [
      { createdAt: "desc" },
      { id: "desc" },
    ];

    const comprasPlusOne = await prisma.purchase.findMany({
      where,
      orderBy,
      take: take + 1,

      // ✅ se vier cursor, usa cursor pagination
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {
            // fallback antigo (offset)
            skip: skipFallback,
          }),

      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            cpf: true,
            identificador: true,
          },
        },
      },
    });

    const hasMore = comprasPlusOne.length > take;
    const compras = hasMore ? comprasPlusOne.slice(0, take) : comprasPlusOne;
    const nextCursor = hasMore ? compras[compras.length - 1]?.id : null;

    // =========================
    // ✅ FIX: calcular Pts CIA na LISTA somando itens (purchaseItem)
    // =========================
    const ids = compras.map((c) => c.id);
    const sumAll = new Map<string, number>(); // purchaseId -> soma geral
    const sumByProgram = new Map<string, Map<string, number>>(); // purchaseId -> (programTo -> soma)

    if (ids.length > 0) {
      const grouped = await prisma.purchaseItem.groupBy({
        by: ["purchaseId", "programTo"],
        where: {
          purchaseId: { in: ids },
          // se seu enum não tem CANCELED, pode remover essa linha
          status: { not: "CANCELED" } as any,
        },
        _sum: { pointsFinal: true },
      });

      for (const g of grouped) {
        const pid = g.purchaseId;
        const s = Number(g._sum.pointsFinal || 0);

        sumAll.set(pid, (sumAll.get(pid) || 0) + s);

        const prog = g.programTo ? String(g.programTo) : "";
        if (prog) {
          if (!sumByProgram.has(pid)) sumByProgram.set(pid, new Map());
          const m = sumByProgram.get(pid)!;
          m.set(prog, (m.get(prog) || 0) + s);
        }
      }
    }

    const comprasOut = compras.map((p) => {
      const program = (p.ciaAerea ?? null) as LoyaltyProgram | null;

      // 1) tenta somar só do programTo da CIA
      let pts = 0;
      if (program) {
        pts = sumByProgram.get(p.id)?.get(String(program)) || 0;
      }

      // 2) fallback: soma geral (caso programTo venha null nos itens)
      if (!pts) {
        pts = sumAll.get(p.id) || 0;
      }

      // 3) fallback final: campo salvo no purchase
      const saved = asInt((p as any).ciaPointsTotal ?? (p as any).pontosCiaTotal ?? 0);
      const finalPts = pts || saved;

      return toPurchaseRow(p, { ciaPointsTotal: finalPts });
    });

    return ok({ compras: comprasOut, nextCursor });
  } catch (e: any) {
    return serverError("Falha ao listar compras.", { detail: e?.message });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const cedenteId = String(body.cedenteId || "");
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const numero = await nextNumeroCompra();

    // ✅ compat: aceitar nomes antigos e novos
    const rawProgram = body.ciaProgram ?? body.ciaAerea ?? null;
    const ciaAerea = rawProgram ? normalizeEnumQ(String(rawProgram)) : null;

    if (rawProgram && !ciaAerea) {
      return badRequest("Programa/Cia inválido. Use: LATAM, SMILES, LIVELO, ESFERA.");
    }

    const ciaPointsTotal = asInt(body.ciaPointsTotal ?? body.pontosCiaTotal ?? 0);

    const cedentePayCents = asInt(body.cedentePayCents ?? 0);
    const vendorCommissionBps = asInt(body.vendorCommissionBps ?? 100);
    const metaMarkupCents = asInt(body.metaMarkupCents ?? body.targetMarkupCents ?? 150);

    const observacao =
      body.observacao != null
        ? String(body.observacao)
        : body.note != null
        ? String(body.note)
        : null;

    const compra = await prisma.purchase.create({
      data: {
        numero,
        cedenteId,
        status: "OPEN",

        // ✅ schema atual
        ciaAerea,
        pontosCiaTotal: ciaPointsTotal,

        cedentePayCents,
        vendorCommissionBps,
        metaMarkupCents,

        observacao,
      },
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            cpf: true,
            identificador: true,
          },
        },
      },
    });

    // ✅ garante totais atualizados
    await recomputeCompra(compra.id);

    const compraFinal = await prisma.purchase.findUnique({
      where: { id: compra.id },
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            cpf: true,
            identificador: true,
          },
        },
      },
    });

    if (!compraFinal) return serverError("Falha ao carregar compra criada.");

    return ok({ compra: toPurchaseRow(compraFinal) }, 201);
  } catch (e: any) {
    return serverError("Falha ao criar compra.", { detail: e?.message });
  }
}
