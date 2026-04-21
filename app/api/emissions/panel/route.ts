import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer as getSession } from "@/lib/auth-server";
import { LoyaltyProgram, EmissionSource } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProgram(v: string | null): LoyaltyProgram | null {
  const s = String(v || "").trim().toUpperCase();
  if (s === "LATAM") return LoyaltyProgram.LATAM;
  if (s === "SMILES") return LoyaltyProgram.SMILES;
  if (s === "LIVELO") return LoyaltyProgram.LIVELO;
  if (s === "ESFERA") return LoyaltyProgram.ESFERA;

  const l = String(v || "").trim().toLowerCase();
  if (l === "latam") return LoyaltyProgram.LATAM;
  if (l === "smiles") return LoyaltyProgram.SMILES;
  if (l === "livelo") return LoyaltyProgram.LIVELO;
  if (l === "esfera") return LoyaltyProgram.ESFERA;

  return null;
}

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

function monthLabelPT(d: Date) {
  const mm = d.getUTCMonth(); // 0-11
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${MONTHS_PT[mm]}/${yy}`;
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
function endOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
function addMonthsUTC(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

type PanelRow = {
  cedenteId: string;
  total: number;
  manual: number;
  renewEndOfMonth: number;
  perMonth: Record<string, number>; // YYYY-MM -> count
};

type PanelResponse = {
  ok: true;
  program: LoyaltyProgram;
  months: Array<{ key: string; label: string }>;
  currentMonthKey: string;
  renewMonthKey: string;
  rows: PanelRow[];
  totals: { total: number; manual: number; renewEndOfMonth: number };
};

/**
 * POST /api/emissions/panel
 * body:
 *  - programa: "latam" | "smiles" | ...
 *  - months?: number (default 13; max 24)
 *  - cedenteIds?: string[] (opcional, recomendado)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const program = parseProgram(body?.programa || body?.program);
    if (!program) {
      return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });
    }

    const monthsReq = Number(body?.months ?? 13);
    const months = Math.max(3, Math.min(24, Number.isFinite(monthsReq) ? monthsReq : 13));

    const cedenteIdsRaw = body?.cedenteIds;
    const cedenteIds = Array.isArray(cedenteIdsRaw)
      ? cedenteIdsRaw.map((x: any) => String(x)).filter(Boolean)
      : null;

    // mês atual (UTC) - coluna verde
    const now = new Date();
    const curMonthStart = startOfMonthUTC(now);
    const currentMonthKey = monthKeyUTC(curMonthStart);

    // meses exibidos (do mais antigo ao mais novo)
    const monthsArr: Array<{ key: string; label: string; start: Date; end: Date }> = [];

    if (program === LoyaltyProgram.SMILES) {
      // SMILES: janela fixa do ano calendário (01/01 a 31/12 do ano atual)
      const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
      for (let i = 0; i < 12; i++) {
        const mStart = addMonthsUTC(yearStart, i);
        const mEnd = endOfMonthUTC(mStart);
        monthsArr.push({
          key: monthKeyUTC(mStart),
          label: monthLabelPT(mStart),
          start: mStart,
          end: mEnd,
        });
      }
    } else {
      for (let i = months - 1; i >= 0; i--) {
        const mStart = addMonthsUTC(curMonthStart, -i);
        const mEnd = endOfMonthUTC(mStart);
        monthsArr.push({
          key: monthKeyUTC(mStart),
          label: monthLabelPT(mStart),
          start: mStart,
          end: mEnd,
        });
      }
    }

    const rangeStart = monthsArr[0].start;
    const rangeEnd = monthsArr[monthsArr.length - 1].end;

    // "Renovam no fim do mês" (LATAM): coluna do mesmo mês do ano anterior (mês-12)
    const renewMonthStart = addMonthsUTC(curMonthStart, -12);
    const renewMonthKey = monthKeyUTC(renewMonthStart);
    const monthKeysSet = new Set(monthsArr.map((m) => m.key));

    // buscar eventos do range
    const where: any = {
      program,
      issuedAt: { gte: rangeStart, lte: rangeEnd },
    };
    if (cedenteIds && cedenteIds.length > 0) {
      where.cedenteId = { in: cedenteIds };
    }

    const events = await prisma.emissionEvent.findMany({
      where,
      select: {
        cedenteId: true,
        issuedAt: true,
        passengersCount: true,
        source: true,
      },
      orderBy: { issuedAt: "asc" },
    });

    const byCedente = new Map<string, PanelRow>();

    function ensureRow(id: string): PanelRow {
      let r = byCedente.get(id);
      if (!r) {
        r = { cedenteId: id, total: 0, manual: 0, renewEndOfMonth: 0, perMonth: {} };
        // inicia todos meses com 0 (mantém estrutura estável)
        for (const m of monthsArr) r.perMonth[m.key] = 0;
        byCedente.set(id, r);
      }
      return r;
    }

    for (const ev of events) {
      const cid = ev.cedenteId;
      const mk = monthKeyUTC(ev.issuedAt);
      if (!monthKeysSet.has(mk)) continue;

      const n = Number(ev.passengersCount || 0);
      if (!Number.isFinite(n) || n <= 0) continue;

      const row = ensureRow(cid);
      row.perMonth[mk] = (row.perMonth[mk] || 0) + n;
      row.total += n;

      if (ev.source === EmissionSource.MANUAL) row.manual += n;
    }

    // calcula renovação no fim do mês
    // - LATAM: usa mês-12 (mesma ideia da sua planilha por colunas)
    // - SMILES: só faz sentido em dezembro (reset em 01/01) -> renovam = total do ano (aprox) se quiser depois
    for (const r of byCedente.values()) {
      if (program === LoyaltyProgram.LATAM) {
        r.renewEndOfMonth = Number(r.perMonth[renewMonthKey] || 0);
      } else {
        r.renewEndOfMonth = 0;
      }
    }

    // se o front mandou cedenteIds, devolve TODOS (mesmo os zerados)
    if (cedenteIds && cedenteIds.length > 0) {
      for (const id of cedenteIds) ensureRow(id);
    }

    const rows = Array.from(byCedente.values());

    // totais gerais
    const totals = rows.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.manual += r.manual;
        acc.renewEndOfMonth += r.renewEndOfMonth;
        return acc;
      },
      { total: 0, manual: 0, renewEndOfMonth: 0 }
    );

    const resp: PanelResponse = {
      ok: true,
      program,
      months: monthsArr.map((m) => ({ key: m.key, label: m.label })),
      currentMonthKey,
      renewMonthKey,
      rows,
      totals,
    };

    return NextResponse.json(resp);
  } catch (err: any) {
    console.error("EMISSIONS PANEL ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado" }, { status: 500 });
  }
}
