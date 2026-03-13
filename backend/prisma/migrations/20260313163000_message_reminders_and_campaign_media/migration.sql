-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'NOTIFIED', 'COMPLETED', 'CANCELED');

-- AlterEnum
ALTER TYPE "ConversationEventType" ADD VALUE 'REMINDER_CREATED';
ALTER TYPE "ConversationEventType" ADD VALUE 'REMINDER_UPDATED';
ALTER TYPE "ConversationEventType" ADD VALUE 'REMINDER_COMPLETED';
ALTER TYPE "ConversationEventType" ADD VALUE 'REMINDER_CANCELED';
ALTER TYPE "ConversationEventType" ADD VALUE 'REMINDER_NOTIFIED';

-- AlterTable
ALTER TABLE "Campaign"
ADD COLUMN "mediaFileName" TEXT,
ADD COLUMN "mediaMimeType" TEXT,
ADD COLUMN "mediaSize" INTEGER,
ADD COLUMN "mediaStoragePath" TEXT;

-- AlterTable
ALTER TABLE "Notification"
ADD COLUMN "entityId" TEXT,
ADD COLUMN "entityType" TEXT,
ADD COLUMN "linkHref" TEXT,
ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "ConversationReminder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "messageToSend" TEXT NOT NULL,
    "internalDescription" TEXT,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "notifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationReminder_workspaceId_status_remindAt_idx"
ON "ConversationReminder"("workspaceId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "ConversationReminder_workspaceId_conversationId_status_remi_idx"
ON "ConversationReminder"("workspaceId", "conversationId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_userId_createdAt_idx"
ON "Notification"("workspaceId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConversationReminder"
ADD CONSTRAINT "ConversationReminder_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReminder"
ADD CONSTRAINT "ConversationReminder_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReminder"
ADD CONSTRAINT "ConversationReminder_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReminder"
ADD CONSTRAINT "ConversationReminder_completedById_fkey"
FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
