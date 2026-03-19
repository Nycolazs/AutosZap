-- Add assignment transfer auto-reply settings
ALTER TABLE "WorkspaceConversationSettings"
ADD COLUMN "sendAssignmentAutoReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assignmentAutoReplyMessage" TEXT;

-- Store reusable quick messages per workspace
CREATE TABLE "QuickMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "QuickMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuickMessage"
ADD CONSTRAINT "QuickMessage_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "QuickMessage_workspaceId_deletedAt_updatedAt_idx"
ON "QuickMessage"("workspaceId", "deletedAt", "updatedAt");

CREATE INDEX "QuickMessage_workspaceId_title_idx"
ON "QuickMessage"("workspaceId", "title");
