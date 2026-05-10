// app/api/funcionarios/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { resolveBalcaoSellerCommissionPercent } from "@/lib/balcao-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

function slugifyId(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9. _-]/g, "")
    .replace(/\s+/g, ".")
    .replace(/-+/g, "-");
}

async function requireAdminSameTeamHeaders() {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return {
      error: NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: noCacheHeaders() }),
    } as const;
  }
  if (sess.role !== "admin") {
    return {
      error: NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403, headers: noCacheHeaders() }),
    } as const;
  }
  return { sess } as const;
}

/** Não remover o último admin do time (exclusão ou mudança de time). */
async function assertNotLastAdminOfTeam(team: string, userId: string) {
  const u = await prisma.user.findFirst({
    where: { id: userId, team },
    select: { role: true },
  });
  if (!u || u.role !== "admin") return;
  const others = await prisma.user.count({
    where: { team, role: "admin", NOT: { id: userId } },
  });
  if (others < 1) {
    const err = new Error("LAST_ADMIN");
    (err as Error & { code?: string }).code = "LAST_ADMIN";
    throw err;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const gate = await requireAdminSameTeamHeaders();
  if ("error" in gate) return gate.error;

  const u = await prisma.user.findFirst({
    where: { id, team: gate.sess.team },
    select: {
      id: true,
      login: true,
      name: true,
      cpf: true,
      employeeId: true,
      balcaoSellerCommissionPercent: true,
      role: true,
      team: true,
      createdAt: true,
      employeeInvite: { select: { code: true, isActive: true } },
      _count: { select: { cedentesOwned: true } },
    },
  });

  if (!u) return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404, headers: noCacheHeaders() });

  return NextResponse.json(
    {
      ok: true,
      data: {
        id: u.id,
        name: u.name,
        login: u.login,
        cpf: u.cpf,
        employeeId: u.employeeId ?? null,
        balcaoSellerCommissionPercent: u.balcaoSellerCommissionPercent ?? null,
        balcaoSellerCommissionPercentEffective: resolveBalcaoSellerCommissionPercent(
          u.balcaoSellerCommissionPercent
        ),
        team: u.team,
        role: u.role,
        createdAt: u.createdAt,
        inviteCode: u.employeeInvite?.code ?? null,
        _count: { cedentes: u._count.cedentesOwned },
      },
    },
    { headers: noCacheHeaders() }
  );
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await requireAdminSameTeamHeaders();
  if ("error" in gate) return gate.error;

  const body = await req.json().catch(() => ({}));

  const existing = await prisma.user.findFirst({
    where: { id, team: gate.sess.team },
    select: { id: true, team: true, role: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404, headers: noCacheHeaders() });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  const cpf = typeof body?.cpf === "string" ? onlyDigits(body.cpf) : "";
  const employeeIdRaw = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
  const employeeId = slugifyId(employeeIdRaw);

  let team: string | undefined = undefined;
  if ("team" in body && body?.team != null) {
    const t = typeof body.team === "string" ? body.team.trim() : "";
    if (!t) {
      return NextResponse.json({ ok: false, error: "Time inválido." }, { status: 400, headers: noCacheHeaders() });
    }
    team = t;
  }

  let balcaoSellerCommissionPercent: number | null | undefined = undefined;
  if ("balcaoSellerCommissionPercent" in body) {
    const raw = body?.balcaoSellerCommissionPercent;
    if (raw === null || raw === "") {
      balcaoSellerCommissionPercent = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return NextResponse.json(
          { ok: false, error: "Percentual de comissão balcão inválido." },
          { status: 400, headers: noCacheHeaders() }
        );
      }
      balcaoSellerCommissionPercent = Math.max(0, Math.min(100, Math.round(n)));
    }
  }

  if (!name || !login || !employeeId) {
    return NextResponse.json({ ok: false, error: "Nome, login e ID são obrigatórios." }, { status: 400, headers: noCacheHeaders() });
  }

  try {
    if (team !== undefined && team !== existing.team) {
      await assertNotLastAdminOfTeam(existing.team, id);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        login,
        cpf: cpf ? cpf : null,
        employeeId,
        ...(team !== undefined ? { team } : {}),
        ...(balcaoSellerCommissionPercent !== undefined
          ? { balcaoSellerCommissionPercent }
          : {}),
      },
      select: {
        id: true,
        name: true,
        login: true,
        cpf: true,
        employeeId: true,
        balcaoSellerCommissionPercent: true,
        team: true,
        role: true,
        createdAt: true,
        employeeInvite: { select: { code: true } },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: updated.id,
          name: updated.name,
          login: updated.login,
          cpf: updated.cpf,
          employeeId: updated.employeeId ?? null,
          balcaoSellerCommissionPercent: updated.balcaoSellerCommissionPercent ?? null,
          balcaoSellerCommissionPercentEffective: resolveBalcaoSellerCommissionPercent(
            updated.balcaoSellerCommissionPercent
          ),
          team: updated.team,
          role: updated.role,
          createdAt: updated.createdAt,
          inviteCode: updated.employeeInvite?.code ?? null,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (e?.code === "LAST_ADMIN" || e?.message === "LAST_ADMIN") {
      return NextResponse.json(
        {
          ok: false,
          error: "Não é possível alterar o time: este é o único administrador do time atual.",
        },
        { status: 409, headers: noCacheHeaders() }
      );
    }
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Login ou ID já está em uso." }, { status: 409, headers: noCacheHeaders() });
    }
    console.error("Erro PATCH /api/funcionarios/[id]:", e);
    return NextResponse.json({ ok: false, error: "Erro ao atualizar funcionário." }, { status: 500, headers: noCacheHeaders() });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await requireAdminSameTeamHeaders();
  if ("error" in gate) return gate.error;

  if (id === gate.sess.id) {
    return NextResponse.json({ ok: false, error: "Você não pode excluir a si mesmo." }, { status: 400, headers: noCacheHeaders() });
  }

  const target = await prisma.user.findFirst({
    where: { id, team: gate.sess.team },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404, headers: noCacheHeaders() });
  }

  try {
    await assertNotLastAdminOfTeam(gate.sess.team, id);

    const [
      cedentes,
      vipLeads,
      agendaCriados,
      auditorias,
      anotacoes,
      vendasConsolidadora,
    ] = await Promise.all([
      prisma.cedente.count({ where: { ownerId: id } }),
      prisma.vipWhatsappLead.count({ where: { employeeId: id } }),
      prisma.agendaEvent.count({ where: { createdById: id } }),
      prisma.agendaAudit.count({ where: { actorId: id } }),
      prisma.anotacao.count({ where: { createdById: id } }),
      prisma.consolidatorSale.count({ where: { createdById: id } }),
    ]);

    const partes: string[] = [];
    if (cedentes > 0) partes.push(`${cedentes} cedente(s) como responsável`);
    if (vipLeads > 0) partes.push(`${vipLeads} lead(s) VIP WhatsApp`);
    if (agendaCriados > 0) partes.push(`${agendaCriados} evento(s) de agenda criados`);
    if (auditorias > 0) partes.push(`${auditorias} registro(s) de auditoria da agenda`);
    if (anotacoes > 0) partes.push(`${anotacoes} anotação(ões)`);
    if (vendasConsolidadora > 0) {
      partes.push(`${vendasConsolidadora} registro(s) em Consolidadora (cadastrados por este usuário)`);
    }

    if (partes.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Não é possível excluir: ${partes.join("; ")}. Resolva os vínculos antes.`,
        },
        { status: 409, headers: noCacheHeaders() }
      );
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (e: any) {
    if (e?.code === "LAST_ADMIN" || e?.message === "LAST_ADMIN") {
      return NextResponse.json(
        {
          ok: false,
          error: "Não é possível excluir o único administrador do time.",
        },
        { status: 409, headers: noCacheHeaders() }
      );
    }
    if (e?.code === "P2003") {
      return NextResponse.json(
        {
          ok: false,
          error: "Não é possível excluir: ainda existem registros vinculados a este usuário no sistema.",
        },
        { status: 409, headers: noCacheHeaders() }
      );
    }
    console.error("Erro DELETE /api/funcionarios/[id]:", e);
    return NextResponse.json({ ok: false, error: "Erro ao excluir funcionário." }, { status: 500, headers: noCacheHeaders() });
  }
}
