-- AlterTable
ALTER TABLE "User" ADD COLUMN     "taxId" VARCHAR(18);

-- CreateIndex
CREATE INDEX "User_taxId_idx" ON "User"("taxId");
