-- AlterTable
ALTER TABLE "WorkspaceConversationSettings"
ADD COLUMN "sendWindowClosedTemplateReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "windowClosedTemplateName" TEXT,
ADD COLUMN "windowClosedTemplateLanguageCode" TEXT;
