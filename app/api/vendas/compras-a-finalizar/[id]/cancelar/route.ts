import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

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

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const compra = await prisma.purchase.findFirst({
    where: {
      id,
      status: "CLOSED",
      cedente: { owner: { team: session.team } },
    },
    select: { id: true, finalizedAt: true, observacao: true },
  });

  if (!compra) {
    return NextResponse.json({ ok: false, error: "Compra não encontrada ou não está LIBERADA." }, { status: 404 });
  }

  // idempotente
  if (compra.finalizedAt) {
    return NextResponse.json({ ok: true, already: true });
  }

  const stamp = `ARQUIVADA (sem impacto) em ${new Date().toISOString()} por ${session.login}`;
  const obs =
    (compra.observacao ? String(compra.observacao).trim() + "\n" : "") + stamp;

  await prisma.purchase.update({
    where: { id },
    data: {
      finalizedAt: new Date(),
      finalizedById: session.id,
      observacao: obs,
    },
  });

  return NextResponse.json({ ok: true });
}
