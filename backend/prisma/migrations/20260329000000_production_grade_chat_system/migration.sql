-- AlterEnum: Add new values to InstanceStatus
ALTER TYPE "InstanceStatus" ADD VALUE 'GENERATING_QR';
ALTER TYPE "InstanceStatus" ADD VALUE 'WAITING_SCAN';
ALTER TYPE "InstanceStatus" ADD VALUE 'SCANNED';
ALTER TYPE "InstanceStatus" ADD VALUE 'RECONNECTING';

-- AlterTable: Add new fields to Instance
ALTER TABLE "Instance" ADD COLUMN "connectionState" JSONB;
ALTER TABLE "Instance" ADD COLUMN "syncState" JSONB;
ALTER TABLE "Instance" ADD COLUMN "sessionPersistedAt" TIMESTAMP(3);

-- AlterTable: Add externalTimestamp to ConversationMessage
ALTER TABLE "ConversationMessage" ADD COLUMN "externalTimestamp" TIMESTAMP(3);

-- CreateTable: SyncCursor
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "cursorType" TEXT NOT NULL,
    "chatId" TEXT,
    "cursorValue" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EventProcessingKey
CREATE TABLE "EventProcessingKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventProcessingKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: SyncCursor unique constraint
CREATE UNIQUE INDEX "SyncCursor_instanceId_cursorType_chatId_key" ON "SyncCursor"("instanceId", "cursorType", "chatId");

-- CreateIndex: SyncCursor workspace+instance index
CREATE INDEX "SyncCursor_workspaceId_instanceId_idx" ON "SyncCursor"("workspaceId", "instanceId");

-- CreateIndex: EventProcessingKey unique constraint
CREATE UNIQUE INDEX "EventProcessingKey_instanceId_eventKey_key" ON "EventProcessingKey"("instanceId", "eventKey");

-- CreateIndex: EventProcessingKey expiresAt index (for TTL cleanup)
CREATE INDEX "EventProcessingKey_expiresAt_idx" ON "EventProcessingKey"("expiresAt");

-- CreateIndex: EventProcessingKey workspace+instance index
CREATE INDEX "EventProcessingKey_workspaceId_instanceId_idx" ON "EventProcessingKey"("workspaceId", "instanceId");

-- AddForeignKey: SyncCursor -> Workspace
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: SyncCursor -> Instance (cascade delete)
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EventProcessingKey -> Workspace
ALTER TABLE "EventProcessingKey" ADD CONSTRAINT "EventProcessingKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: EventProcessingKey -> Instance (cascade delete)
ALTER TABLE "EventProcessingKey" ADD CONSTRAINT "EventProcessingKey_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
