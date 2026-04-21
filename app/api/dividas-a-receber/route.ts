import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function normalizeText(v: unknown, max = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}
function parseDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

type ReceberStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELED";
type ReceberCategoria =
  | "EMPRESTIMO"
  | "CARTAO"
  | "PARCELAMENTO"
  | "SERVICO"
  | "OUTROS";
type ReceberMetodo =
  | "PIX"
  | "CARTAO"
  | "BOLETO"
  | "DINHEIRO"
  | "TRANSFERENCIA"
  | "OUTRO";

const STATUS: ReceberStatus[] = ["OPEN", "PARTIAL", "PAID", "CANCELED"];
const CATEG: ReceberCategoria[] = [
  "EMPRESTIMO",
  "CARTAO",
  "PARCELAMENTO",
  "SERVICO",
  "OUTROS",
];
const METOD: ReceberMetodo[] = [
  "PIX",
  "CARTAO",
  "BOLETO",
  "DINHEIRO",
  "TRANSFERENCIA",
  "OUTRO",
];

export function computeStatus(
  totalCents: number,
  receivedCents: number
): ReceberStatus {
  if (totalCents <= 0) return "OPEN";
  if (receivedCents <= 0) return "OPEN";
  if (receivedCents >= totalCents) return "PAID";
  return "PARTIAL";
}

function buildWhere(sessionTeam: string, statusRaw: string, q: string) {
  const where: any = { team: sessionTeam };

  const status = (statusRaw || "").toUpperCase();
  if (status && STATUS.includes(status as ReceberStatus)) {
    where.status = status;
  }

  if (q) {
    where.OR = [
      { debtorName: { contains: q, mode: "insensitive" } },
      { debtorDoc: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { sourceLabel: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

function summarizeFromAggregate(sumTotal: number, sumReceived: number) {
  const totalCents = safeInt(sumTotal, 0);
  const receivedCents = safeInt(sumReceived, 0);
  // saldo global (agregado). assume que no geral received <= total.
  const balanceCents = Math.max(0, totalCents - receivedCents);
  return { totalCents, receivedCents, balanceCents };
}

export async function GET(req: Request) {
  const session = await requireSession();

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "").toUpperCase();
  const q = (url.searchParams.get("q") || "").trim();
  const take = Math.min(Math.max(safeInt(url.searchParams.get("take"), 100), 1), 300);

  const where = buildWhere(session.team, status, q);

  // ✅ lista (paginada)
  const rows = await prisma.dividaAReceber.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take,
    include: {
      payments: { orderBy: { receivedAt: "desc" } },
      owner: { select: { id: true, name: true, login: true } },
    },
  });

  // ✅ totais ALL (independente de take)
  const aggAll = await prisma.dividaAReceber.aggregate({
    where,
    _sum: { totalCents: true, receivedCents: true },
  });

  // ✅ totais OPEN+PARTIAL (independente de take)
  const whereOpen = {
    ...where,
    status: { in: ["OPEN", "PARTIAL"] as ReceberStatus[] },
  };

  const aggOpen = await prisma.dividaAReceber.aggregate({
    where: whereOpen,
    _sum: { totalCents: true, receivedCents: true },
  });

  const totalsAll = summarizeFromAggregate(
    aggAll._sum.totalCents ?? 0,
    aggAll._sum.receivedCents ?? 0
  );

  const totalsOpen = summarizeFromAggregate(
    aggOpen._sum.totalCents ?? 0,
    aggOpen._sum.receivedCents ?? 0
  );

  return NextResponse.json({ ok: true, rows, totalsAll, totalsOpen });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));

  const debtorName = normalizeText(body.debtorName, 120);
  const title = normalizeText(body.title, 160);
  const totalCents = safeInt(body.totalCents, 0);

  if (!debtorName)
    return NextResponse.json(
      { ok: false, error: "Informe o nome de quem te deve." },
      { status: 400 }
    );
  if (!title)
    return NextResponse.json(
      { ok: false, error: "Informe um título." },
      { status: 400 }
    );
  if (totalCents <= 0)
    return NextResponse.json(
      { ok: false, error: "Total precisa ser maior que 0." },
      { status: 400 }
    );

  const categoryRaw = String(body.category || "OUTROS").toUpperCase();
  const methodRaw = String(body.method || "PIX").toUpperCase();

  const categoryFinal: ReceberCategoria = CATEG.includes(categoryRaw as ReceberCategoria)
    ? (categoryRaw as ReceberCategoria)
    : "OUTROS";

  const methodFinal: ReceberMetodo = METOD.includes(methodRaw as ReceberMetodo)
    ? (methodRaw as ReceberMetodo)
    : "PIX";

  const dueDate = parseDate(body.dueDate);

  const created = await prisma.dividaAReceber.create({
    data: {
      ownerId: session.id,
      team: session.team,

      debtorName,
      debtorDoc: normalizeText(body.debtorDoc, 40) || null,
      debtorPhone: normalizeText(body.debtorPhone, 40) || null,
      debtorEmail: normalizeText(body.debtorEmail, 160) || null,

      title,
      description: normalizeText(body.description, 2000) || null,

      category: categoryFinal,
      method: methodFinal,

      totalCents,
      receivedCents: 0,
      dueDate,
      status: "OPEN",

      sourceLabel: normalizeText(body.sourceLabel, 120) || null,
    },
  });

  return NextResponse.json({ ok: true, row: created });
}
