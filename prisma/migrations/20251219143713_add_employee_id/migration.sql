-- CreateIndex
CREATE INDEX "cedente_term_acceptances_acceptedAt_idx" ON "cedente_term_acceptances"("acceptedAt");

-- CreateIndex
CREATE INDEX "cedentes_createdAt_idx" ON "cedentes"("createdAt");

-- CreateIndex
CREATE INDEX "employee_invites_isActive_idx" ON "employee_invites"("isActive");

-- CreateIndex
CREATE INDEX "employee_invites_userId_idx" ON "employee_invites"("userId");

-- CreateIndex
CREATE INDEX "users_team_idx" ON "users"("team");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");
