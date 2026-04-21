import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
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

type PaymentStatus = "PENDING" | "PAID" | "CANCELED";

export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const saleId = String(body.saleId || "").trim();
  const status = String(body.status || "").trim().toUpperCase() as PaymentStatus;

  if (!saleId) return NextResponse.json({ ok: false, error: "saleId obrigatório" }, { status: 400 });
  if (!["PENDING", "PAID", "CANCELED"].includes(status)) {
    return NextResponse.json({ ok: false, error: "status inválido" }, { status: 400 });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: { id: true, totalCents: true, receivableId: true },
      });
      if (!sale) throw new Error("Venda não encontrada.");

      const now = new Date();

      // Atualiza venda
      await tx.sale.update({
        where: { id: saleId },
        data: {
          paymentStatus: status,
          paidAt: status === "PAID" ? now : null,
        },
      });

      // Atualiza receivable (se existir)
      if (sale.receivableId) {
        if (status === "PAID") {
          await tx.receivable.update({
            where: { id: sale.receivableId },
            data: {
              status: "RECEIVED",
              receivedCents: sale.totalCents,
              balanceCents: 0,
            },
          });
        } else if (status === "PENDING") {
          await tx.receivable.update({
            where: { id: sale.receivableId },
            data: {
              status: "OPEN",
              receivedCents: 0,
              balanceCents: sale.totalCents,
            },
          });
        } else {
          // CANCELED
          await tx.receivable.update({
            where: { id: sale.receivableId },
            data: {
              status: "CANCELED",
              receivedCents: 0,
              balanceCents: 0,
            },
          });
        }
      }

      return { saleId, status };
    });

    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao atualizar status" }, { status: 400 });
  }
}
