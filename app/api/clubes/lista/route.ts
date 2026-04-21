import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS = ["LATAM", "SMILES", "LIVELO", "ESFERA"] as const;
type Program = (typeof PROGRAMS)[number];

const STATUSES = ["ACTIVE", "PAUSED", "CANCELED", "NEVER"] as const;
type Status = (typeof STATUSES)[number];

type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ClubCell = {
  id: string;
  program: Program;
  status: Exclude<Status, "NEVER">;
  tierK: number;
  subscribedAt: string; // ISO
  pointsExpireAt: string | null;
  smilesBonusEligibleAt: string | null;
  updatedAt: string; // ISO
};

type MatrixRow = {
  cedente: CedenteLite;
  LATAM: ClubCell | null;
  SMILES: ClubCell | null;
  LIVELO: ClubCell | null;
  ESFERA: ClubCell | null;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normUpper(v?: string | null) {
  const s = (v || "").trim();
  return s ? s.toUpperCase() : "";
}

function normalizeProgram(v?: string | null): Program | "" {
  const up = normUpper(v);
  if (!up) return "";
  return (PROGRAMS as readonly string[]).includes(up) ? (up as Program) : "";
}

function normalizeStatus(v?: string | null): Status | "" {
  const up = normUpper(v);
  if (!up) return "";
  return (STATUSES as readonly string[]).includes(up) ? (up as Status) : "";
}

function pickLatestByCedenteProgram(
  clubs: Array<{
    id: string;
    cedenteId: string;
    program: Program;
    status: "ACTIVE" | "PAUSED" | "CANCELED";
    tierK: number;
    subscribedAt: Date;
    pointsExpireAt: Date | null;
    smilesBonusEligibleAt: Date | null;
    updatedAt: Date;
  }>
) {
  const map = new Map<string, ClubCell>();

  // já vem ordenado desc, então o 1º que entrar é o “mais recente”
  for (const c of clubs) {
    const key = `${c.cedenteId}:${c.program}`;
    if (map.has(key)) continue;

    map.set(key, {
      id: c.id,
      program: c.program,
      status: c.status,
      tierK: Number(c.tierK) || 10,
      subscribedAt: c.subscribedAt.toISOString(),
      pointsExpireAt: c.pointsExpireAt ? c.pointsExpireAt.toISOString() : null,
      smilesBonusEligibleAt: c.smilesBonusEligibleAt
        ? c.smilesBonusEligibleAt.toISOString()
        : null,
      updatedAt: c.updatedAt.toISOString(),
    });
  }

  return map;
}

function applyFilters(rows: MatrixRow[], q?: string, program?: Program | "", status?: Status | "") {
  const qq = (q || "").trim().toLowerCase();
  const prog = program || "";
  const st = status || "";

  return rows.filter((r) => {
    // busca
    if (qq) {
      const hay = [
        r.cedente.nomeCompleto,
        r.cedente.identificador,
        r.cedente.cpf,
      ]
        .join(" ")
        .toLowerCase();

      if (!hay.includes(qq)) return false;
    }

    // filtros programa/status
    if (!prog && !st) return true;

    const cells = {
      LATAM: r.LATAM,
      SMILES: r.SMILES,
      LIVELO: r.LIVELO,
      ESFERA: r.ESFERA,
    } as const;

    // quando escolhe um programa específico
    if (prog) {
      const cell = cells[prog];
      if (st === "NEVER") return !cell;
      if (!st) return true; // só programa filtrado (qualquer status)
      return Boolean(cell && cell.status === st);
    }

    // quando NÃO escolhe programa, mas escolhe status:
    if (st) {
      if (st === "NEVER") {
        // "NEVER" = não tem nenhum clube em nenhum programa
        return !r.LATAM && !r.SMILES && !r.LIVELO && !r.ESFERA;
      }
      // status = qualquer programa com esse status
      return (
        (r.LATAM && r.LATAM.status === st) ||
        (r.SMILES && r.SMILES.status === st) ||
        (r.LIVELO && r.LIVELO.status === st) ||
        (r.ESFERA && r.ESFERA.status === st)
      );
    }

    return true;
  });
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim().slice(0, 80) || "";
  const program = normalizeProgram(searchParams.get("program"));
  const status = normalizeStatus(searchParams.get("status"));

  if (searchParams.get("program") && !program)
    return bad("Program inválido");
  if (searchParams.get("status") && !status)
    return bad("Status inválido");

  try {
    // 1) cedentes do time (sempre todos; filtro q é aplicado depois)
    const cedentes = await prisma.cedente.findMany({
      where: { owner: { team: session.team } },
      select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
      orderBy: [{ nomeCompleto: "asc" }, { identificador: "asc" }],
    });

    const cedenteIds = cedentes.map((c) => c.id);

    // 2) clubes do time (pegamos tudo e escolhemos o mais recente por programa)
    const clubs = await prisma.clubSubscription.findMany({
      where: {
        team: session.team,
        ...(cedenteIds.length ? { cedenteId: { in: cedenteIds } } : {}),
      },
      select: {
        id: true,
        cedenteId: true,
        program: true,
        status: true,
        tierK: true,
        subscribedAt: true,
        pointsExpireAt: true,
        smilesBonusEligibleAt: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
    });

    const latest = pickLatestByCedenteProgram(
      clubs as any
    );

    // 3) monta matriz
    const rows: MatrixRow[] = cedentes.map((c) => {
      const get = (p: Program) => latest.get(`${c.id}:${p}`) || null;

      return {
        cedente: c,
        LATAM: get("LATAM"),
        SMILES: get("SMILES"),
        LIVELO: get("LIVELO"),
        ESFERA: get("ESFERA"),
      };
    });

    const finalRows = applyFilters(rows, q, program, status);

    return NextResponse.json({ ok: true, items: finalRows });
  } catch (e: any) {
    return bad("Falha ao carregar lista de clubes", 500);
  }
}
