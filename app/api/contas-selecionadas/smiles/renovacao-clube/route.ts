// app/api/contas-selecionadas/smiles/renovacao-clube/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthKeyUTC(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec((key || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { y, m0: mm - 1 };
}

function startOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0, 1, 0, 0, 0, 0));
}

function endOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0 + 1, 0, 23, 59, 59, 999));
}

function addMonthsUTC(base: Date, months: number) {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate(), 0, 0, 0, 0)
  );
}

export async function GET(req: Request) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  try {
    /**
     * ✅ Por padrão, incluímos CANCELADOS também.
     * Opcional: /api/.../renovacao-clube?includeCanceled=0
     */
    const url = new URL(req.url);
    const includeCanceled = url.searchParams.get("includeCanceled") !== "0";
    const monthKey =
      (url.searchParams.get("monthKey") || "").trim() || monthKeyUTC(new Date());

    const selectedMonthStart = startOfMonthUTCFromKey(monthKey);
    const selectedMonthEnd = endOfMonthUTCFromKey(monthKey);
    if (!selectedMonthStart || !selectedMonthEnd) {
      return bad("monthKey inválido (use YYYY-MM)");
    }

    const previousMonthStart = startOfMonthUTCFromKey(
      monthKeyUTC(addMonthsUTC(selectedMonthStart, -1))
    );
    const previousMonthEnd = endOfMonthUTCFromKey(
      monthKeyUTC(addMonthsUTC(selectedMonthStart, -1))
    );
    if (!previousMonthStart || !previousMonthEnd) {
      return bad("Falha ao calcular mês anterior.");
    }

    const statusIn = includeCanceled
      ? (["ACTIVE", "PAUSED", "CANCELED"] as const)
      : (["ACTIVE", "PAUSED"] as const);

    /**
     * ✅ Deduplicação correta no Postgres (DISTINCT ON):
     * - orderBy PRECISA começar pelo(s) campo(s) do distinct (cedenteId)
     * - depois vem o critério do "mais recente" (updatedAt desc)
     * - tie-break por id desc para ficar determinístico
     */
    const latestPerCedente = await prisma.clubSubscription.findMany({
      where: {
        program: "SMILES",
        status: { in: statusIn as any },
        smilesBonusEligibleAt: { not: null },

        // ✅ segurança: só devolve cedentes do mesmo time do usuário logado
        cedente: { owner: { team: session.team } },
      },
      distinct: ["cedenteId"],
      orderBy: [
        { cedenteId: "asc" }, // ✅ obrigatório com distinct no Postgres
        { updatedAt: "desc" }, // ✅ pega o mais recente por cedente
        { id: "desc" }, // ✅ desempate
      ],
      select: {
        id: true,
        cedenteId: true,
        tierK: true,
        status: true,
        subscribedAt: true,
        lastRenewedAt: true,
        renewalDay: true,
        smilesBonusEligibleAt: true,
        updatedAt: true,
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosSmiles: true,
            owner: { select: { id: true, name: true, login: true } },
          },
        },
      },
    });

    // ✅ Ordena para a UI (mês/dia), sem quebrar a deduplicação
    const unique = [...latestPerCedente].sort((a, b) => {
      const av = String(a.smilesBonusEligibleAt || "");
      const bv = String(b.smilesBonusEligibleAt || "");
      if (av !== bv) return av.localeCompare(bv); // asc por data elegível
      // tie-break: mais atualizado primeiro
      const au = String(a.updatedAt || "");
      const bu = String(b.updatedAt || "");
      if (au !== bu) return bu.localeCompare(au);
      return String(b.id).localeCompare(String(a.id));
    });

    const recentOrCarryOver = await prisma.cedente.findMany({
      where: {
        owner: { team: session.team },
        status: { in: ["PENDING", "APPROVED"] },
        createdAt: { gte: previousMonthStart, lte: selectedMonthEnd },
        clubSubscriptions: {
          none: {
            program: "SMILES",
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { nomeCompleto: "asc" }],
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        status: true,
        createdAt: true,
        pontosSmiles: true,
        owner: { select: { id: true, name: true, login: true } },
      },
    });

    const pendingAvailable = recentOrCarryOver
      .map((row) => {
        const createdMonthKey = monthKeyUTC(row.createdAt);
        if (createdMonthKey === monthKey) {
          return {
            cedenteId: row.id,
            createdAt: row.createdAt.toISOString(),
            bucket: "RECENT" as const,
            cedente: row,
          };
        }

        if (
          row.createdAt >= previousMonthStart &&
          row.createdAt <= previousMonthEnd
        ) {
          return {
            cedenteId: row.id,
            createdAt: row.createdAt.toISOString(),
            bucket: "PREVIOUS_MONTH_PENDING" as const,
            cedente: row,
          };
        }

        return null;
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    return NextResponse.json({
      ok: true,
      monthKey,
      items: unique,
      pendingAvailable,
    });
  } catch (e) {
    console.error(e);
    return bad("Falha ao carregar renovação do clube (Smiles).", 500);
  }
}
