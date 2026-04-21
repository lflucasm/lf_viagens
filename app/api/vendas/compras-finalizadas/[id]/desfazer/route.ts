import { NextRequest, NextResponse } from "next/server";
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
  const store = await cookies(); // ✅ aqui é o ponto do erro
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// ✅ Next 16 (Turbopack) pode tipar params como Promise
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.id) return bad("Não autenticado", 401);

  if (session.role !== "admin") return bad("Sem permissão", 403);

  const { id } = await context.params; // id === purchaseId
  const purchaseId = id;
  if (!purchaseId) return bad("id ausente.");

  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.findFirst({
        where: {
          id: purchaseId,
          cedente: { owner: { team: session.team } },
        },
        select: { id: true, finalizedAt: true },
      });

      if (!p) throw new Error("Compra não encontrada.");
      if (!p.finalizedAt) throw new Error("Esta compra não está finalizada.");

      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          finalizedAt: null,
          finalizedById: null,

          finalSalesCents: null,
          finalSalesPointsValueCents: null,
          finalSalesTaxesCents: null,

          finalProfitBrutoCents: null,
          finalBonusCents: null,
          finalProfitCents: null,

          finalSoldPoints: null,
          finalPax: null,
          finalAvgMilheiroCents: null,
          finalRemainingPoints: null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(e?.message || "Falha ao desfazer finalização.");
  }
}
