-- AlterTable
ALTER TABLE "Installment" ADD COLUMN     "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Installment_status_idx" ON "Installment"("status");
