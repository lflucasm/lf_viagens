-- AlterTable
ALTER TABLE "affiliates" ADD COLUMN "login" TEXT;
ALTER TABLE "affiliates" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "affiliates" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_login_key" ON "affiliates"("login");

-- CreateIndex
CREATE INDEX "affiliates_team_login_idx" ON "affiliates"("team", "login");
