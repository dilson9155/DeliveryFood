-- Remove o módulo de disparo em massa de mensagens (campanhas).

-- DropForeignKey
ALTER TABLE "CampaignRecipient" DROP CONSTRAINT "CampaignRecipient_campaignId_fkey";
ALTER TABLE "CampaignRecipient" DROP CONSTRAINT "CampaignRecipient_customerId_fkey";
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_createdById_fkey";

-- DropTable
DROP TABLE "CampaignRecipient";
DROP TABLE "Campaign";

-- DropEnum
DROP TYPE "RecipientStatus";
DROP TYPE "CampaignStatus";
