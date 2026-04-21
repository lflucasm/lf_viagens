ALTER TABLE "balcao_operacoes"
  ADD COLUMN "locator" TEXT;

CREATE INDEX "balcao_operacoes_team_locator_idx"
  ON "balcao_operacoes"("team", "locator");
