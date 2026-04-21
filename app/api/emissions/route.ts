import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer as getSession } from "@/lib/auth-server";
import { LoyaltyProgram, EmissionSource } from "@prisma/client";
import bcrypt from "bcryptjs";

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

function parseIssuedDateYYYYMMDD(s: string | null): Date | null {
  const v = String(s || "").trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

function startOfYearUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}
function endOfYearUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}
function endOfDayUTC(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
  );
}
function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function programLimit(p: LoyaltyProgram) {
  if (p === LoyaltyProgram.LATAM) return 25;
  if (p === LoyaltyProgram.SMILES) return 25;
  return 999999;
}

/** =========================
 *  AUTH: validar senha do usuário logado
 *  ========================= */
async function getPasswordHashForSession(session: any): Promise<string | null> {
  // Tentamos modelos comuns sem “quebrar” TS usando prisma as any
  const candidates = [
    { model: "user", where: (s: any) => ({ id: s.id }) },
    { model: "users", where: (s: any) => ({ id: s.id }) },

    { model: "funcionario", where: (s: any) => ({ id: s.id }) },
    { model: "funcionarios", where: (s: any) => ({ id: s.id }) },

    { model: "staff", where: (s: any) => ({ id: s.id }) },
    { model: "account", where: (s: any) => ({ id: s.id }) },

    // fallback por login (caso o id da sessão não seja o mesmo id do model)
    { model: "user", where: (s: any) => ({ login: s.login }) },
    { model: "funcionario", where: (s: any) => ({ login: s.login }) },
    { model: "staff", where: (s: any) => ({ login: s.login }) },
    { model: "account", where: (s: any) => ({ login: s.login }) },
  ];

  for (const c of candidates) {
    const m = (prisma as any)[c.model];
    if (!m?.findUnique) continue;

    try {
      const row = await m.findUnique({
        where: c.where(session),
        select: {
          passwordHash: true,
          password_hash: true,
          password: true, // se você guardou em campo diferente (não recomendado)
        },
      });

      const hash = row?.passwordHash || row?.password_hash || null;

      if (hash && typeof hash === "string") return hash;

      // ⚠️ fallback MUITO permissivo (só pra não travar caso seu /api/auth use "password" hashed)
      if (row?.password && typeof row.password === "string") return row.password;
    } catch {
      // ignora e tenta o próximo model
    }
  }

  return null;
}

async function assertReauthByPassword(session: any, typedPassword: string) {
  const pwd = String(typedPassword || "");
  if (!pwd.trim()) throw new Error("Senha obrigatória.");

  const hash = await getPasswordHashForSession(session);
  if (!hash) throw new Error("Não foi possível validar senha (hash não encontrado).");

  const ok = await bcrypt.compare(pwd, hash);
  if (!ok) throw new Error("Senha inválida.");
}

/** =========================
 *  GET (inalterado)
 *  ========================= */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mode = String(searchParams.get("mode") || "list");
    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    const programa = parseProgram(searchParams.get("programa"));

    if (!cedenteId) {
      return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
    }
    if (!programa) {
      return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });
    }

    if (mode === "usage") {
      const issuedDate = parseIssuedDateYYYYMMDD(searchParams.get("issuedDate"));
      if (!issuedDate) {
        return NextResponse.json({ ok: false, error: "issuedDate inválida." }, { status: 400 });
      }

      const limit = programLimit(programa);

      let windowStart: Date;
      let windowEnd: Date;

      if (programa === LoyaltyProgram.SMILES) {
        windowStart = startOfYearUTC(issuedDate);
        windowEnd = endOfYearUTC(issuedDate);
      } else if (programa === LoyaltyProgram.LATAM) {
        windowEnd = endOfDayUTC(issuedDate);
        windowStart = addDaysUTC(
          new Date(
            Date.UTC(
              issuedDate.getUTCFullYear(),
              issuedDate.getUTCMonth(),
              issuedDate.getUTCDate(),
              0, 0, 0, 0
            )
          ),
          -364
        );
      } else {
        windowStart = startOfYearUTC(issuedDate);
        windowEnd = endOfYearUTC(issuedDate);
      }

      const agg = await prisma.emissionEvent.aggregate({
        where: {
          cedenteId,
          program: programa,
          issuedAt: { gte: windowStart, lte: windowEnd },
        },
        _sum: { passengersCount: true },
      });

      const used = agg._sum.passengersCount || 0;
      const remaining = Math.max(0, limit - used);

      return NextResponse.json({
        program: programa,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        limit,
        used,
        remaining,
      });
    }

    const take = Math.min(200, Math.max(1, Number(searchParams.get("take") || 50)));

    const rows = await prisma.emissionEvent.findMany({
      where: { cedenteId, program: programa },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        cedenteId: true,
        program: true,
        passengersCount: true,
        issuedAt: true,
        source: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        issuedAt: r.issuedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (err: any) {
    console.error("EMISSIONS GET ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado" }, { status: 500 });
  }
}

/** =========================
 *  POST (inalterado)
 *  ========================= */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const cedenteId = String(body?.cedenteId || "").trim();
    const programa = parseProgram(body?.programa || body?.program);
    const issuedDate = parseIssuedDateYYYYMMDD(body?.issuedDate);
    const passengersCount = Number(body?.passengersCount);

    if (!cedenteId) return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
    if (!programa) return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });
    if (!issuedDate) return NextResponse.json({ ok: false, error: "issuedDate inválida." }, { status: 400 });
    if (!Number.isFinite(passengersCount) || passengersCount < 1) {
      return NextResponse.json({ ok: false, error: "passengersCount inválido (>=1)." }, { status: 400 });
    }

    const note = typeof body?.note === "string" ? body.note.trim() : "";

    const created = await prisma.emissionEvent.create({
      data: {
        cedenteId,
        program: programa,
        passengersCount: Math.trunc(passengersCount),
        issuedAt: issuedDate,
        source: EmissionSource.MANUAL,
        note: note ? note : null,
      },
      select: {
        id: true,
        cedenteId: true,
        program: true,
        passengersCount: true,
        issuedAt: true,
        source: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...created,
          issuedAt: created.issuedAt.toISOString(),
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("EMISSIONS POST ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado" }, { status: 500 });
  }
}

/** =========================
 *  DELETE — ZERAR / LIMPAR (SEM SENHA; APENAS CONFIRMAÇÃO)
 *  body:
 *   - confirm: true  ✅ obrigatório
 *   - scope: "CEDENTE" | "ALL" | "SELECTED"
 *   - cedenteId?: string
 *   - programa?: "latam" | "smiles" | ...
 *   - ids?: string[]
 *   - confirmAll?: boolean (obrigatório se ALL sem filtro)
 *
 *  (OBS: campos de senha foram mantidos por compatibilidade,
 *   mas NÃO são mais validados.)
 *  ========================= */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // ✅ agora é só confirmação explícita
    if (body?.confirm !== true) {
      return NextResponse.json(
        { ok: false, error: "Confirmação obrigatória para apagar dados." },
        { status: 400 }
      );
    }

    const scope = String(body?.scope || "").trim().toUpperCase(); // CEDENTE | ALL | SELECTED
    const password = String(body?.password || "");

    // Mantém compatibilidade (front antigo pode mandar password), mas não usa mais
    void password;

    // ✅ valida a senha do usuário logado (DESATIVADO)
    // try {
    //   await assertReauthByPassword(session, password);
    // } catch (e: any) {
    //   return NextResponse.json({ ok: false, error: e?.message || "Senha inválida." }, { status: 403 });
    // }

    const cedenteId = String(body?.cedenteId || "").trim();
    const programa = parseProgram(body?.programa || body?.program);
    const idsRaw = body?.ids;
    const confirmAll = body?.confirmAll === true;

    // base where (filtros opcionais)
    const baseWhere: any = {};
    if (cedenteId) baseWhere.cedenteId = cedenteId;
    if (programa) baseWhere.program = programa;

    if (scope === "CEDENTE") {
      if (!cedenteId) {
        return NextResponse.json(
          { ok: false, error: "scope=CEDENTE exige cedenteId." },
          { status: 400 }
        );
      }
      const del = await prisma.emissionEvent.deleteMany({ where: baseWhere });
      return NextResponse.json({
        ok: true,
        scope: "CEDENTE",
        deleted: del.count,
        cedenteId,
        program: programa || null,
      });
    }

    if (scope === "SELECTED") {
      const ids = Array.isArray(idsRaw)
        ? idsRaw.map((x) => String(x)).filter(Boolean)
        : [];

      if (ids.length === 0) {
        return NextResponse.json(
          { ok: false, error: "scope=SELECTED exige ids: string[] (não vazio)." },
          { status: 400 }
        );
      }

      const delWhere: any = { id: { in: ids } };
      if (cedenteId) delWhere.cedenteId = cedenteId;
      if (programa) delWhere.program = programa;

      const del = await prisma.emissionEvent.deleteMany({ where: delWhere });

      return NextResponse.json({
        ok: true,
        scope: "SELECTED",
        deleted: del.count,
        cedenteId: cedenteId || null,
        program: programa || null,
      });
    }

    if (scope === "ALL") {
      const hasAnyFilter = Boolean(cedenteId) || Boolean(programa);
      if (!hasAnyFilter && !confirmAll) {
        return NextResponse.json(
          { ok: false, error: 'scope=ALL sem filtros exige "confirmAll": true.' },
          { status: 400 }
        );
      }

      const del = await prisma.emissionEvent.deleteMany({ where: baseWhere });

      return NextResponse.json({
        ok: true,
        scope: "ALL",
        deleted: del.count,
        cedenteId: cedenteId || null,
        program: programa || null,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'scope inválido. Use "CEDENTE", "ALL" ou "SELECTED".' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("EMISSIONS DELETE ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado" }, { status: 500 });
  }
}
