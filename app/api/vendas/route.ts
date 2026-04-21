import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Prisma, SalePaymentStatus } from "@prisma/client";
import { triggerEmployeePayoutAutoCompute } from "@/lib/payouts/autoCompute";
import {
  calcBonusCents,
  calcCommissionCents,
  calcPointsValueCents,
  clampInt,
  formatSaleNumber,
  pointsField,
} from "../_helpers/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type CedentePointsField = "pontosLatam" | "pontosSmiles" | "pontosLivelo" | "pontosEsfera";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
  name?: string;
  email?: string | null;
};

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function isPurchaseNumero(v: string) {
  return /^ID\d{5}$/i.test((v || "").trim());
}

function parseDateISOToLocal(v?: unknown): Date {
  const s = String(v || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date();
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mm - 1, d);
}

function parseDateISOToLocalOrNull(v?: unknown): Date | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mm - 1, d);
}

async function nextCounter(tx: Prisma.TransactionClient, key: string) {
  await tx.counter.upsert({
    where: { key },
    create: { key, value: 0 },
    update: {},
    select: { key: true, value: true },
  });

  const updated = await tx.counter.update({
    where: { key },
    data: { value: { increment: 1 } },
    select: { value: true },
  });

  return updated.value;
}

async function resolveCedenteId(tx: Prisma.TransactionClient, cedenteKey: string) {
  const key = (cedenteKey || "").trim();
  if (!key) return null;

  const ced = await tx.cedente.findFirst({
    where: { OR: [{ id: key }, { identificador: key }] },
    select: { id: true },
  });

  return ced?.id ?? null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

/**
 * ✅ BLINDAGEM: normaliza PV / total / milheiro SEM deixar taxa contaminar.
 * Prioridade:
 * 1) se vier PV direto: PV + taxa = total
 * 2) se vier total: PV = total - taxa
 * 3) senão: PV = calc(points, milheiro)
 */
function normalizeSaleValues(args: {
  points: number;
  milheiroCents: number;
  embarqueFeeCents: number;
  totalCentsIn?: number;
  pointsValueCentsIn?: number;
}) {
  const points = clampInt(args.points);
  const fee = clampInt(args.embarqueFeeCents);
  const milIn = clampInt(args.milheiroCents);

  const totalIn = clampInt(args.totalCentsIn);
  const pvIn = clampInt(args.pointsValueCentsIn);

  let pv = 0;
  let total = 0;
  let milFinal = milIn;

  // 1) PV informado (fonte forte)
  if (pvIn > 0) {
    pv = pvIn;
    total = pv + fee;
    milFinal = points > 0 ? Math.round((pv * 1000) / points) : milIn;
    return { pointsValueCents: pv, totalCents: total, milheiroFinal: milFinal };
  }

  // 2) Total informado (nunca deixa taxa entrar no PV)
  if (totalIn > 0) {
    total = totalIn;
    pv = Math.max(total - fee, 0);
    milFinal = points > 0 && pv > 0 ? Math.round((pv * 1000) / points) : milIn;
    return { pointsValueCents: pv, totalCents: total, milheiroFinal: milFinal };
  }

  // 3) fallback: milheiro sem taxa
  pv = calcPointsValueCents(points, milIn);
  total = pv + fee;
  milFinal = points > 0 && pv > 0 ? Math.round((pv * 1000) / points) : milIn;

  return { pointsValueCents: pv, totalCents: total, milheiroFinal: milFinal };
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get("limit") || 200);
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 200));
  const cursor = (searchParams.get("cursor") || "").trim();
  const q = (searchParams.get("q") || "").trim();
  const status = (searchParams.get("status") || "").trim().toUpperCase();
  const clientId = (searchParams.get("clientId") || "").trim();

  const where: Prisma.SaleWhereInput = {};

  if (status && status !== "ALL") {
    if (status === "PENDING" || status === "PAID" || status === "CANCELED") {
      where.paymentStatus = status as SalePaymentStatus;
    }
  }

  if (clientId && clientId !== "ALL") {
    where.clienteId = clientId;
  }

  if (q) {
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { locator: { contains: q, mode: "insensitive" } },
      { feeCardLabel: { contains: q, mode: "insensitive" } },
      { cliente: { nome: { contains: q, mode: "insensitive" } } },
      { cliente: { identificador: { contains: q, mode: "insensitive" } } },
      { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
      { cedente: { identificador: { contains: q, mode: "insensitive" } } },
    ];
  }

  const sales = await prisma.sale.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      numero: true,
      date: true,
      program: true,
      points: true,
      passengers: true,
      milheiroCents: true,
      embarqueFeeCents: true,
      pointsValueCents: true,
      totalCents: true,
      paymentStatus: true,
      paidAt: true,
      locator: true,
      purchaseCode: true,
      firstPassengerLastName: true,
      departureAirportIata: true,
      departureDate: true,
      returnDate: true,
      feeCardLabel: true,
      commissionCents: true,
      bonusCents: true,
      metaMilheiroCents: true,

      cliente: { select: { id: true, identificador: true, nome: true } },
      cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
      purchase: { select: { id: true, numero: true } },
      seller: { select: { id: true, name: true, login: true } },

      receivable: {
        select: {
          id: true,
          totalCents: true,
          receivedCents: true,
          balanceCents: true,
          status: true,
        },
      },

      createdAt: true,
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  let nextCursor: string | null = null;
  let list = sales;

  if (sales.length > limit) {
    const next = sales.pop();
    nextCursor = next?.id || null;
    list = sales;
  }

  return NextResponse.json({ ok: true, sales: list, nextCursor });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  const userId = session?.id ?? null;
  const sessionTeam = session?.team ?? null;

  if (!userId || !sessionTeam) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const program = body.program as Program;
  const points = clampInt(body.points);
  const passengers = clampInt(body.passengers);

  // inputs
  const milheiroCents = clampInt(body.milheiroCents);
  const embarqueFeeCents = clampInt(body.embarqueFeeCents);

  // ✅ opcionais (pra blindar entrada)
  const totalCentsIn = clampInt(body.totalCents);
  const pointsValueCentsIn = clampInt(body.pointsValueCents);

  const cedenteKey = String(body.cedenteId || "").trim();
  const clienteId = String(body.clienteId || "").trim();
  const purchaseKey = String(body.purchaseNumero || body.purchaseId || "").trim();
  const sellerIdRaw = String(body.sellerId || "").trim();

  const feeCardLabel = body.feeCardLabel ? String(body.feeCardLabel) : null;
  const locator = body.locator ? String(body.locator) : null;
  const purchaseCodeRaw = body.purchaseCode
    ? String(body.purchaseCode).trim()
    : null;
  const purchaseCode = purchaseCodeRaw ? purchaseCodeRaw.toUpperCase() : null;
  const firstPassengerLastName = body.firstPassengerLastName
    ? String(body.firstPassengerLastName).trim()
    : null;
  const departureAirportIataRaw = body.departureAirportIata
    ? String(body.departureAirportIata).trim()
    : null;
  const departureAirportIata = departureAirportIataRaw
    ? departureAirportIataRaw.toUpperCase()
    : null;
  const departureDate = parseDateISOToLocalOrNull(body.departureDate);
  const returnDate = parseDateISOToLocalOrNull(body.returnDate);

  const date = parseDateISOToLocal(body.date);

  if (!["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(program)) {
    return NextResponse.json({ ok: false, error: "Programa inválido" }, { status: 400 });
  }
  if (!cedenteKey || !clienteId) {
    return NextResponse.json({ ok: false, error: "Cedente/Cliente obrigatório" }, { status: 400 });
  }
  if (!purchaseKey) {
    return NextResponse.json({ ok: false, error: "Compra (ID) obrigatória" }, { status: 400 });
  }
  if (points <= 0 || passengers <= 0) {
    return NextResponse.json({ ok: false, error: "Pontos/Passageiros inválidos" }, { status: 400 });
  }
  // ✅ se o front não manda PV/total, exige milheiro
  if (pointsValueCentsIn <= 0 && totalCentsIn <= 0 && milheiroCents <= 0) {
    return NextResponse.json({ ok: false, error: "Milheiro inválido" }, { status: 400 });
  }
  if (program === "SMILES" || program === "LATAM") {
    if (!firstPassengerLastName) {
      return NextResponse.json(
        { ok: false, error: "Sobrenome do 1º passageiro é obrigatório para Smiles e Latam." },
        { status: 400 }
      );
    }
  }
  if (program === "SMILES" || program === "LATAM") {
    if (!departureDate) {
      return NextResponse.json(
        { ok: false, error: "Data de ida é obrigatória para Smiles e Latam." },
        { status: 400 }
      );
    }
  }
  if (program === "LATAM") {
    if (!purchaseCode || !/^LA[A-Z0-9]*$/i.test(purchaseCode)) {
      return NextResponse.json(
        { ok: false, error: "Código de compra LATAM deve iniciar com LA." },
        { status: 400 }
      );
    }
  }
  if (program === "SMILES") {
    if (!departureAirportIata || !/^[A-Z]{3}$/.test(departureAirportIata)) {
      return NextResponse.json(
        { ok: false, error: "Aeroporto de ida deve ter 3 letras (IATA) para Smiles." },
        { status: 400 }
      );
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const effectiveSellerId = sellerIdRaw || userId;
      const seller = await tx.user.findFirst({
        where: { id: effectiveSellerId, team: sessionTeam },
        select: { id: true },
      });
      if (!seller) throw new Error("Vendedor não encontrado.");

      const cedenteId = await resolveCedenteId(tx, cedenteKey);
      if (!cedenteId) throw new Error("Cedente não encontrado.");

      const hasBlock = await tx.blockedAccount.findFirst({
        where: { cedenteId, program, status: "OPEN" },
        select: { id: true },
      });
      if (hasBlock) throw new Error("Conta bloqueada para este programa.");

      const ced = await tx.cedente.findUnique({
        where: { id: cedenteId },
        select: {
          id: true,
          status: true,
          pontosLatam: true,
          pontosSmiles: true,
          pontosLivelo: true,
          pontosEsfera: true,
        },
      });
      if (!ced) throw new Error("Cedente não encontrado.");
      if (ced.status !== "APPROVED") throw new Error("Cedente não aprovado.");

      const field = pointsField(program) as CedentePointsField;
      const availablePts = clampInt(ced[field]);
      if (availablePts < points) throw new Error("Pontos insuficientes.");

      const purchase = isPurchaseNumero(purchaseKey)
        ? await tx.purchase.findFirst({
            where: { numero: purchaseKey.toUpperCase(), cedenteId },
            select: { id: true, cedenteId: true, status: true, metaMilheiroCents: true },
          })
        : await tx.purchase.findUnique({
            where: { id: purchaseKey },
            select: { id: true, cedenteId: true, status: true, metaMilheiroCents: true },
          });

      if (!purchase) throw new Error("Compra não encontrada.");
      if (purchase.status !== "CLOSED") throw new Error("Compra não está LIBERADA.");
      if (purchase.cedenteId !== cedenteId) throw new Error("Compra não pertence ao cedente selecionado.");

      const purchaseIdReal = purchase.id;
      const metaMilheiroCents = clampInt(purchase.metaMilheiroCents);

      // ✅ NORMALIZA (PV sem taxa, total com taxa, milheiro sem taxa)
      const norm = normalizeSaleValues({
        points,
        milheiroCents,
        embarqueFeeCents,
        totalCentsIn,
        pointsValueCentsIn,
      });

      const pointsValueCents = norm.pointsValueCents;
      const totalCents = norm.totalCents;
      const milheiroFinal = norm.milheiroFinal;

      // ✅ comissão e bônus SEM taxa
      const commissionCents = calcCommissionCents(pointsValueCents);
      const bonusCents = calcBonusCents(points, milheiroFinal, metaMilheiroCents);

      const n = await nextCounter(tx, "SALE");
      const numero = formatSaleNumber(n);

      const cliente = await tx.cliente.findUnique({
        where: { id: clienteId },
        select: { nome: true },
      });
      if (!cliente) throw new Error("Cliente não encontrado.");

      const receivable = await tx.receivable.create({
        data: {
          title: `Venda ${numero} • ${cliente.nome}`,
          description: `Programa ${program} • ${points} pts • ${passengers} pax`,
          totalCents,
          receivedCents: 0,
          balanceCents: totalCents,
          status: "OPEN",
        },
      });

      const sale = await tx.sale.create({
        data: {
          numero,
          date,
          program,
          points,
          passengers,

          // ✅ grava milheiro CONSISTENTE (sem taxa)
          milheiroCents: milheiroFinal,

          embarqueFeeCents,
          pointsValueCents,
          totalCents,

          commissionCents,
          bonusCents,
          metaMilheiroCents,

          feeCardLabel,
          locator,
          purchaseCode,
          firstPassengerLastName,
          departureAirportIata,
          departureDate,
          returnDate,
          paymentStatus: "PENDING",
          cedenteId,
          clienteId,
          purchaseId: purchaseIdReal,
          sellerId: seller.id,
          receivableId: receivable.id,
        },
        select: { id: true, numero: true },
      });

      const decData = {
        [field]: { decrement: points },
      } as Prisma.CedenteUpdateInput;

      await tx.cedente.update({
        where: { id: cedenteId },
        data: decData,
      });

      await tx.emissionEvent.create({
        data: {
          cedenteId,
          program,
          passengersCount: passengers,
          issuedAt: date,
          source: "SALE",
          note: `Venda ${sale.numero}${locator ? ` • Locator ${locator}` : ""}`,
        },
      });

      return sale;
    });

    const payoutAutoCompute = await triggerEmployeePayoutAutoCompute(req, {
      team: sessionTeam,
      fallbackBasis: "SALE_DATE",
    });

    return NextResponse.json({ ok: true, sale: result, payoutAutoCompute });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e, "Erro ao criar venda") },
      { status: 400 }
    );
  }
}
