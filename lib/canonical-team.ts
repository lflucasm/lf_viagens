/**
 * Single-tenant: um único identificador de “time” na sessão da API e em gravações novas.
 * Evita divergência entre cookie legado e dados no banco.
 */
export const CANONICAL_OPERATION_TEAM =
  process.env.CANONICAL_OPERATION_TEAM?.trim() || "@LF.Viagens";
