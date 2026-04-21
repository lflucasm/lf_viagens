import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { getAffiliateMetrics } from "@/lib/affiliates/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "");
}

function cleanDocument(value: unknown) {
  const digits = onlyDigits(value);
  if (!digits) return "__INVALID__";
  if (digits.length !== 11 && digits.length !== 14) return "__INVALID__";
  return digits;
}

function cleanOptionalUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "__INVALID__";
    return url.toString();
  } catch {
    return "__INVALID__";
  }
}

function parseCommissionBps(value: unknown) {
  let raw = String(value ?? "").trim().replace("%", "");
  raw = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

function normLogin(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

const affiliateSelect = {
  id: true,
  team: true,
  name: true,
  document: true,
  login: true,
  flightSalesLink: true,
  pointsPurchaseLink: true,
  commissionBps: true,
  isActive: true,
  passwordHash: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { clients: true } },
} as const;

async function withMetrics<
  T extends { id: string; team: string; commissionBps: number; passwordHash?: string | null },
>(affiliate: T) {
  const metrics = await getAffiliateMetrics(affiliate, { includeSales: false });
  const {
    team: _team,
    passwordHash,
    ...publicAffiliate
  } = affiliate;
  void _team;
  return { ...publicAffiliate, hasAccess: Boolean(passwordHash), metrics };
}

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getId(ctx: Ctx) {
  const params = await ctx.params;
  return String(params.id || "").trim();
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSessionServer();
    const team = String(session?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const id = await getId(ctx);
    if (!id) return NextResponse.json({ ok: false, error: "ID obrigatório." }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "Informe o nome do afiliado." }, { status: 400 });
    }

    const document = cleanDocument(body.document);
    if (document === "__INVALID__") {
      return NextResponse.json({ ok: false, error: "CPF/CNPJ inválido." }, { status: 400 });
    }

    const login = normLogin(body.login);
    if (!login) {
      return NextResponse.json({ ok: false, error: "Informe o login do afiliado." }, { status: 400 });
    }
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) {
      return NextResponse.json(
        { ok: false, error: "Login deve ter 3 a 40 caracteres e usar letras, números, ponto, hífen ou underline." },
        { status: 400 }
      );
    }

    const flightSalesLink = cleanOptionalUrl(body.flightSalesLink);
    if (flightSalesLink === "__INVALID__") {
      return NextResponse.json({ ok: false, error: "Link de venda de passagens inválido." }, { status: 400 });
    }
    if (!flightSalesLink) {
      return NextResponse.json({ ok: false, error: "Informe o link de venda de passagens." }, { status: 400 });
    }

    const pointsPurchaseLink = cleanOptionalUrl(body.pointsPurchaseLink);
    if (pointsPurchaseLink === "__INVALID__") {
      return NextResponse.json({ ok: false, error: "Link de compra de pontos inválido." }, { status: 400 });
    }
    if (!pointsPurchaseLink) {
      return NextResponse.json({ ok: false, error: "Informe o link de compra de pontos." }, { status: 400 });
    }

    const commissionBps = parseCommissionBps(body.commissionPercent);
    if (commissionBps === null) {
      return NextResponse.json(
        { ok: false, error: "Percentual de comissão inválido. Use de 0 a 100." },
        { status: 400 }
      );
    }

    const existing = await prisma.affiliate.findFirst({
      where: { id, team },
      select: { id: true, passwordHash: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Afiliado não encontrado." }, { status: 404 });
    }

    const duplicate = await prisma.affiliate.findFirst({
      where: { login, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ ok: false, error: "Já existe afiliado com este login." }, { status: 409 });
    }

    const password = String(body.password ?? "");
    if (password && password.length < 4) {
      return NextResponse.json({ ok: false, error: "Senha deve ter pelo menos 4 caracteres." }, { status: 400 });
    }
    if (!existing.passwordHash && !password) {
      return NextResponse.json({ ok: false, error: "Defina uma senha para liberar o acesso." }, { status: 400 });
    }

    const affiliate = await prisma.affiliate.update({
      where: { id },
      data: {
        name,
        document,
        login,
        ...(password ? { passwordHash: sha256(password) } : {}),
        flightSalesLink,
        pointsPurchaseLink,
        commissionBps,
        isActive: body.isActive === false ? false : true,
      },
      select: affiliateSelect,
    });

    return NextResponse.json({ ok: true, data: { affiliate: await withMetrics(affiliate) } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Erro ao atualizar afiliado.") },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSessionServer();
    const team = String(session?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const id = await getId(ctx);
    if (!id) return NextResponse.json({ ok: false, error: "ID obrigatório." }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const existing = await prisma.affiliate.findFirst({
      where: { id, team },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Afiliado não encontrado." }, { status: 404 });
    }

    const affiliate = await prisma.affiliate.update({
      where: { id },
      data: {
        isActive: body.isActive === false ? false : true,
      },
      select: affiliateSelect,
    });

    return NextResponse.json({ ok: true, data: { affiliate: await withMetrics(affiliate) } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Erro ao alterar status do afiliado.") },
      { status: 500 }
    );
  }
}
