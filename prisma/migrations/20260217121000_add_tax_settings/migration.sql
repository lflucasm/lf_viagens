-- Add tax settings fields
ALTER TABLE "settings" ADD COLUMN "taxPercent" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "settings" ADD COLUMN "taxEffectiveFrom" TIMESTAMP(3);

CREATE INDEX "settings_taxEffectiveFrom_idx" ON "settings"("taxEffectiveFrom");
