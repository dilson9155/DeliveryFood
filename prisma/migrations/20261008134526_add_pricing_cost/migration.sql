-- CreateTable
CREATE TABLE "PricingCost" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" VARCHAR(40),
    "unit" VARCHAR(10) NOT NULL DEFAULT 'UN',
    "supplier" VARCHAR(120),
    "purchaseCost" DOUBLE PRECISION,
    "freight" DOUBLE PRECISION,
    "otherCosts" DOUBLE PRECISION,
    "additionalCostPct" DOUBLE PRECISION,
    "desiredMarginPct" DOUBLE PRECISION,
    "taxPct" DOUBLE PRECISION,
    "commissionPct" DOUBLE PRECISION,
    "cardFeePct" DOUBLE PRECISION,
    "marketplaceFeePct" DOUBLE PRECISION,
    "maxDiscountPct" DOUBLE PRECISION,
    "fixedCost" DOUBLE PRECISION,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingCost_productId_key" ON "PricingCost"("productId");

-- CreateIndex
CREATE INDEX "PricingCost_productId_idx" ON "PricingCost"("productId");

-- AddForeignKey
ALTER TABLE "PricingCost" ADD CONSTRAINT "PricingCost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
