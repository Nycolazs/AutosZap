-- Conversation events: track quick-message usage
ALTER TYPE "ConversationEventType" ADD VALUE IF NOT EXISTS 'QUICK_MESSAGE_USED';

-- Quick message usage actions
CREATE TYPE "QuickMessageUsageAction" AS ENUM ('SEND_NOW', 'EDIT_IN_INPUT');

CREATE TABLE "QuickMessageUsage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "quickMessageId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "QuickMessageUsageAction" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuickMessageUsage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuickMessageUsage"
ADD CONSTRAINT "QuickMessageUsage_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuickMessageUsage"
ADD CONSTRAINT "QuickMessageUsage_quickMessageId_fkey"
FOREIGN KEY ("quickMessageId") REFERENCES "QuickMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "QuickMessageUsage_workspaceId_createdAt_idx"
ON "QuickMessageUsage"("workspaceId", "createdAt");

CREATE INDEX "QuickMessageUsage_workspaceId_action_createdAt_idx"
ON "QuickMessageUsage"("workspaceId", "action", "createdAt");

CREATE INDEX "QuickMessageUsage_quickMessageId_createdAt_idx"
ON "QuickMessageUsage"("quickMessageId", "createdAt");
