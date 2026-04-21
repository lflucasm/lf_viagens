/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "cedentes" DROP CONSTRAINT "cedentes_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "cedentes" DROP CONSTRAINT "cedentes_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "employee_invites" DROP CONSTRAINT "employee_invites_userId_fkey";

-- AlterTable
ALTER TABLE "cedentes" ADD COLUMN     "inviteId" TEXT;

-- AlterTable
ALTER TABLE "employee_invites" ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "uses" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "team" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "cedentes_inviteId_idx" ON "cedentes"("inviteId");

-- AddForeignKey
ALTER TABLE "employee_invites" ADD CONSTRAINT "employee_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "employee_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
