-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "printTemplateId" TEXT DEFAULT 'thermal80',
ADD COLUMN     "receiptFooter" TEXT,
ADD COLUMN     "receiptMessage" TEXT;
