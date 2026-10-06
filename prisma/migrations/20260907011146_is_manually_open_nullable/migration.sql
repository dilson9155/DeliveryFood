-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "isManuallyOpen" DROP NOT NULL,
ALTER COLUMN "isManuallyOpen" DROP DEFAULT;
