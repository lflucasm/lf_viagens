-- CreateEnum
CREATE TYPE "EmployeeCommissionMode" AS ENUM ('STANDARD', 'MILHEIRO_LUCRO_VENDA');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "employeeCommissionMode" "EmployeeCommissionMode" NOT NULL DEFAULT 'STANDARD';
