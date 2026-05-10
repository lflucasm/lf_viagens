import "server-only";
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CedenteStatus, PixTipo } from "@prisma/client";

/** Prefixo do identificador do cedente sintético por time (estoque operacional). */
export const OPERATIONAL_HOUSE_IDENT_PREFIX = "ESTOQUE-OP-";

export function operationalHouseIdentificador(team: string): string {
  const h = crypto.createHash("sha256").update(`op-house:${team}`).digest("hex").slice(0, 20);
  return `${OPERATIONAL_HOUSE_IDENT_PREFIX}${h}`;
}

function syntheticCpfForTeam(team: string, salt: string): string {
  const h = crypto.createHash("sha256").update(`op-cpf:${team}:${salt}`).digest();
  let n = 0;
  for (let i = 0; i < 6; i++) n = (n * 256 + h[i]) >>> 0;
  n = 10000000000 + (n % 89999999999);
  return String(n).slice(0, 11);
}

/**
 * Cedente interno por time: concentra saldos de compras operacionais (clubes, pontos, transferências)
 * sem vínculo a pessoa física. Um registro por time.
 */
export async function ensureOperationalHouseCedente(
  db: PrismaClient,
  team: string,
  ownerUserId: string
): Promise<string> {
  const ident = operationalHouseIdentificador(team);

  const existing = await db.cedente.findUnique({
    where: { identificador: ident },
    select: { id: true },
  });
  if (existing) return existing.id;

  const owner = await db.user.findFirst({
    where: { id: ownerUserId, team },
    select: { id: true },
  });
  if (!owner) throw new Error("Usuário da sessão não encontrado no time.");

  let salt = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const cpf = syntheticCpfForTeam(team, salt || String(attempt));
    try {
      const c = await db.cedente.create({
        data: {
          identificador: ident,
          nomeCompleto: `Estoque operacional — ${team}`,
          cpf,
          banco: "N/A",
          pixTipo: PixTipo.ALEATORIA,
          chavePix: `estoque-op-${ident.slice(-12)}`,
          titularConfirmado: true,
          ownerId: owner.id,
          status: CedenteStatus.APPROVED,
          reviewedAt: new Date(),
        },
      });
      return c.id;
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "P2002") {
        salt = `${attempt}:${Date.now()}`;
        continue;
      }
      throw e;
    }
  }

  throw new Error("Não foi possível criar o cedente de estoque operacional.");
}
