-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "BillCategory" AS ENUM ('SUPPLIER', 'EMPLOYEE', 'RENT', 'ENERGY', 'WATER', 'INTERNET', 'TAX', 'MARKETING', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PayableMethod" AS ENUM ('CASH', 'CARD', 'PIX', 'BANK_TRANSFER', 'BOLETO', 'OTHER');

-- CreateEnum
CREATE TYPE "PayableType" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "category" "BillCategory" NOT NULL DEFAULT 'OTHER',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "customerId" TEXT,
    "orderId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "parentType" "PayableType" NOT NULL,
    "payableId" TEXT,
    "receivableId" TEXT,
    "number" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PayableMethod",
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payable_issueDate_idx" ON "Payable"("issueDate");

-- CreateIndex
CREATE INDEX "Payable_category_idx" ON "Payable"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_orderId_key" ON "Receivable"("orderId");

-- CreateIndex
CREATE INDEX "Receivable_issueDate_idx" ON "Receivable"("issueDate");

-- CreateIndex
CREATE INDEX "Receivable_customerId_idx" ON "Receivable"("customerId");

-- CreateIndex
CREATE INDEX "Installment_dueDate_idx" ON "Installment"("dueDate");

-- CreateIndex
CREATE INDEX "Installment_parentType_dueDate_idx" ON "Installment"("parentType", "dueDate");

-- CreateIndex
CREATE INDEX "Installment_payableId_idx" ON "Installment"("payableId");

-- CreateIndex
CREATE INDEX "Installment_receivableId_idx" ON "Installment"("receivableId");

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
