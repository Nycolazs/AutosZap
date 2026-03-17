-- AlterEnum
ALTER TYPE "AutoMessageType" ADD VALUE IF NOT EXISTS 'FINAL_RESOLVED';
ALTER TYPE "AutoMessageType" ADD VALUE IF NOT EXISTS 'FINAL_CLOSED';

-- AlterTable
ALTER TABLE "Conversation"
ADD COLUMN "resolvedAutoMessageSentAt" TIMESTAMP(3),
ADD COLUMN "resolvedAutoMessageLastError" TEXT,
ADD COLUMN "resolvedAutoMessageDispatchToken" TEXT,
ADD COLUMN "resolvedAutoMessageDispatchStartedAt" TIMESTAMP(3),
ADD COLUMN "closedAutoMessageSentAt" TIMESTAMP(3),
ADD COLUMN "closedAutoMessageLastError" TEXT,
ADD COLUMN "closedAutoMessageDispatchToken" TEXT,
ADD COLUMN "closedAutoMessageDispatchStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkspaceConversationSettings"
ADD COLUMN "sendResolvedAutoReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resolvedAutoReplyMessage" TEXT,
ADD COLUMN "sendClosedAutoReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "closedAutoReplyMessage" TEXT;
