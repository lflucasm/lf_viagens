-- Snapshots passam a ser manuais e podem existir várias vezes no mesmo dia.
-- O histórico antigo foi autorizado para limpeza porque os valores não estavam batendo.
DELETE FROM "cash_snapshots";
DELETE FROM "caixa_imediato_snapshots";

DROP INDEX IF EXISTS "cash_snapshots_date_key";
DROP INDEX IF EXISTS "caixa_imediato_snapshots_team_date_key";

ALTER TABLE "cash_snapshots"
ADD COLUMN IF NOT EXISTS "team" TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS "cash_snapshots_date_idx";
CREATE INDEX IF NOT EXISTS "cash_snapshots_team_date_idx" ON "cash_snapshots"("team", "date");
CREATE INDEX IF NOT EXISTS "cash_snapshots_team_createdAt_idx" ON "cash_snapshots"("team", "createdAt");

CREATE INDEX IF NOT EXISTS "caixa_imediato_snapshots_team_createdAt_idx" ON "caixa_imediato_snapshots"("team", "createdAt");
