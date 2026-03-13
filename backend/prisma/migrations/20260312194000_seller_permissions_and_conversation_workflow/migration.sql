-- CreateEnum
CREATE TYPE "PermissionKey" AS ENUM ('DASHBOARD_VIEW', 'REPORTS_VIEW', 'VIEW_METRICS', 'INBOX_VIEW', 'CRM_VIEW', 'CONTACTS_VIEW', 'CONTACTS_EDIT', 'CAMPAIGNS_VIEW', 'CAMPAIGNS_MANAGE', 'LISTS_VIEW', 'GROUPS_VIEW', 'TAGS_VIEW', 'PIPELINE_VIEW', 'ASSISTANTS_VIEW', 'KNOWLEDGE_BASES_VIEW', 'AI_TOOLS_VIEW', 'INTEGRATIONS_VIEW', 'SETTINGS_VIEW', 'TEAM_VIEW', 'EXPORT_DATA', 'TRANSFER_CONVERSATION', 'REOPEN_CONVERSATION', 'RESOLVE_CONVERSATION', 'CLOSE_CONVERSATION', 'CONFIGURE_CONVERSATION_ROUTING', 'CONFIGURE_AUTO_MESSAGES', 'CONFIGURE_BUSINESS_HOURS', 'MANAGE_TEAM', 'MANAGE_USER_ROLES', 'MANAGE_USER_PERMISSIONS', 'DEVELOPMENT_VIEW');

-- CreateEnum
CREATE TYPE "AutoMessageType" AS ENUM ('IN_BUSINESS_HOURS', 'OUT_OF_BUSINESS_HOURS');

-- CreateEnum
CREATE TYPE "ConversationEventType" AS ENUM ('ASSIGNED', 'TRANSFERRED', 'FIRST_RESPONSE', 'STATUS_CHANGED', 'WAITING_TIMEOUT', 'REOPENED', 'RESOLVED', 'CLOSED', 'AUTO_MESSAGE_SENT');

-- AlterEnum
-- Prisma wraps PostgreSQL migrations in a transaction, so adding an enum
-- value and using it immediately as a default is unsafe. Recreate the enum
-- with the new value and swap it in atomically.
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'MANAGER', 'AGENT', 'SELLER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConversationStatus" ADD VALUE 'NEW';
ALTER TYPE "ConversationStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "ConversationStatus" ADD VALUE 'WAITING';
ALTER TYPE "ConversationStatus" ADD VALUE 'RESOLVED';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TeamMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "TeamMember" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'SELLER';

-- AlterTable
ALTER TABLE "TeamMember" ALTER COLUMN "role" SET DEFAULT 'SELLER';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "currentCycleStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "firstHumanResponseAt" TIMESTAMP(3),
ADD COLUMN     "lastHumanReplyAt" TIMESTAMP(3),
ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "waitingSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN     "autoMessageType" "AutoMessageType",
ADD COLUMN     "isAutomated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "PermissionKey" NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceConversationSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inactivityTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "timezone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
    "autoReplyCooldownMinutes" INTEGER NOT NULL DEFAULT 120,
    "sendBusinessHoursAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "businessHoursAutoReply" TEXT,
    "sendOutOfHoursAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "outOfHoursAutoReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceConversationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceBusinessHour" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceBusinessHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "ConversationEventType" NOT NULL,
    "fromStatus" "ConversationStatus",
    "toStatus" "ConversationStatus",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPermission_workspaceId_permission_idx" ON "UserPermission"("workspaceId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permission_key" ON "UserPermission"("userId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceConversationSettings_workspaceId_key" ON "WorkspaceConversationSettings"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceBusinessHour_settingsId_weekday_key" ON "WorkspaceBusinessHour"("settingsId", "weekday");

-- CreateIndex
CREATE INDEX "ConversationEvent_workspaceId_conversationId_createdAt_idx" ON "ConversationEvent"("workspaceId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationEvent_workspaceId_type_createdAt_idx" ON "ConversationEvent"("workspaceId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_status_assignedUserId_lastMessageA_idx" ON "Conversation"("workspaceId", "status", "assignedUserId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_waitingSince_status_idx" ON "Conversation"("workspaceId", "waitingSince", "status");

-- CreateIndex
CREATE INDEX "ConversationMessage_workspaceId_conversationId_autoMessageT_idx" ON "ConversationMessage"("workspaceId", "conversationId", "autoMessageType", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceConversationSettings" ADD CONSTRAINT "WorkspaceConversationSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceBusinessHour" ADD CONSTRAINT "WorkspaceBusinessHour_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "WorkspaceConversationSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvent" ADD CONSTRAINT "ConversationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvent" ADD CONSTRAINT "ConversationEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvent" ADD CONSTRAINT "ConversationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
