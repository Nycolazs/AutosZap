-- CreateEnum
CREATE TYPE "SupportTicketMessageSenderType" AS ENUM ('CUSTOMER', 'PLATFORM');

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderGlobalUserId" TEXT,
    "senderType" "SupportTicketMessageSenderType" NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_senderGlobalUserId_idx" ON "SupportTicketMessage"("senderGlobalUserId");

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_senderGlobalUserId_fkey" FOREIGN KEY ("senderGlobalUserId") REFERENCES "GlobalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
