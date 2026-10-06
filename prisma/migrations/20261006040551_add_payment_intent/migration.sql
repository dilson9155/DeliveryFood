-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'ASAAS', 'PAGBANK');

-- CreateEnum
CREATE TYPE "PaymentProviderStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'DECLINED', 'CANCELED', 'REFUNDED', 'IN_ANALYSIS', 'EXPIRED');

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'ASAAS',
    "providerPaymentId" TEXT,
    "providerChargeId" TEXT,
    "status" "PaymentProviderStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "amount" DOUBLE PRECISION NOT NULL,
    "qrCodeBase64" TEXT,
    "qrCodeText" TEXT,
    "pixExpiresAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "rawLastResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_orderId_key" ON "PaymentIntent"("orderId");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- CreateIndex
CREATE INDEX "PaymentIntent_providerPaymentId_idx" ON "PaymentIntent"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentIntent_providerChargeId_idx" ON "PaymentIntent"("providerChargeId");

-- CreateIndex
CREATE INDEX "PaymentEvent_intentId_createdAt_idx" ON "PaymentEvent"("intentId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
