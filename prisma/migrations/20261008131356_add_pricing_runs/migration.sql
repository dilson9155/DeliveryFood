-- CreateTable
CREATE TABLE "PricingRun" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "oldPrice" DOUBLE PRECISION NOT NULL,
    "newPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PricingRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingRun_createdAt_idx" ON "PricingRun"("createdAt");

-- CreateIndex
CREATE INDEX "PricingRunItem_runId_idx" ON "PricingRunItem"("runId");

-- AddForeignKey
ALTER TABLE "PricingRun" ADD CONSTRAINT "PricingRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRunItem" ADD CONSTRAINT "PricingRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PricingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRunItem" ADD CONSTRAINT "PricingRunItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
