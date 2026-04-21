// app/api/compras/liberadas/route.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

function clampNonNegInt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.trunc(x));
}

function clampPosInt(n: any, fb = 50) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fb;
  const v = Math.max(1, Math.trunc(x));
  return Math.min(200, v); // evita payload gigante
}

function fixMetaMilheiroCents(row: {
  metaMilheiroCents: number | null;
  custoMilheiroCents: number | null;
  metaMarkupCents: number | null;
}) {
  const custo = clampNonNegInt(row.custoMilheiroCents);
  const markup = clampNonNegInt(row.metaMarkupCents);
  const metaRaw = clampNonNegInt(row.metaMilheiroCents);

  // ✅ se veio meta explícita
  if (metaRaw > 0) {
    // se temos custo e a meta é MENOR que o custo, ela provavelmente veio como MARKUP
    if (custo > 0 && metaRaw < custo) return custo + metaRaw;

    // senão, assume que já é META FINAL
    return metaRaw;
  }

  // ✅ não veio meta: usa custo + markup (ou só markup se custo não existir)
  if (custo > 0) return custo + markup;
  return markup;
}

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

function isProgram(v: any): v is Program {
  return v === "LATAM" || v === "SMILES" || v === "LIVELO" || v === "ESFERA";
}

type FinalizedMode = "OPEN" | "FINALIZED" | "ALL";
function parseFinalizedMode(searchParams: URLSearchParams): FinalizedMode {
  const v = String(searchParams.get("finalized") || "").trim().toLowerCase();

  // finalized=0 | false | open  -> OPEN
  if (v === "" || v === "0" || v === "false" || v === "open") return "OPEN";

  // finalized=1 | true | finalized -> FINALIZED
  if (v === "1" || v === "true" || v === "finalized") return "FINALIZED";

  // finalized=all -> ALL
  if (v === "all") return "ALL";

  // fallback seguro
  return "OPEN";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session?.id) return badRequest("Não autenticado.");

    const { searchParams } = new URL(req.url);

    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const take = clampPosInt(searchParams.get("take"), 50);

    // ✅ opcional: filtrar por programa
    const programRaw = String(searchParams.get("program") || "").trim().toUpperCase();
    const program = isProgram(programRaw) ? (programRaw as Program) : null;

    // ✅ Mantemos a função/variável pra não quebrar compatibilidade,
    // mas a rota "liberadas" aqui deve retornar APENAS:
    // CLOSED + NÃO FINALIZADAS (finalizedAt null).
    //
    // Mesmo que alguém mande ?finalized=1 ou all, ignoramos.
    // (isso resolve o caso de "só aparece 1" por estar alternando conforme finalizedAt muda)
    void parseFinalizedMode(searchParams);
    const finalizedMode: FinalizedMode = "OPEN";

    const comprasRaw = await prisma.purchase.findMany({
      where: {
        cedenteId,
        status: "CLOSED",

        // ✅ regra fixa: somente CLOSED não-finalizadas
        ...(finalizedMode === "OPEN" ? { finalizedAt: null } : {}),

        ...(program ? { ciaAerea: program } : {}),

        // ✅ segurança: o cedente tem que ser do mesmo time do usuário logado
        cedente: { owner: { team: session.team } },
      },
      orderBy: [
        { liberadoEm: "desc" },
        { id: "desc" }, // ✅ fallback estável se liberadoEm vier null/igual
      ],
      take,
      select: {
        id: true,
        numero: true,
        status: true,
        ciaAerea: true,

        metaMilheiroCents: true,
        custoMilheiroCents: true,
        metaMarkupCents: true,

        liberadoEm: true,
        finalizedAt: true, // ✅ útil pra telas que precisem diferenciar
        liberadoPor: { select: { id: true, name: true, login: true } },
      },
    });

    const compras = comprasRaw.map((c) => ({
      ...c,
      // ✅ sempre retorna meta FINAL pro client (sem mexer em mais nada)
      metaMilheiroCents: fixMetaMilheiroCents(c),
    }));

    return ok({ compras });
  } catch (e: any) {
    return serverError("Falha ao listar compras liberadas.", { detail: e?.message });
  }
}
