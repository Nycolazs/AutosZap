ALTER TYPE "InstanceProvider" ADD VALUE 'WHATSAPP_WEB';

ALTER TABLE "Instance"
  ADD COLUMN "externalInstanceId" TEXT,
  ADD COLUMN "internalWebhookSecretEncrypted" TEXT,
  ADD COLUMN "providerConfig" JSONB,
  ADD COLUMN "providerMetadata" JSONB,
  ADD COLUMN "providerSessionState" JSONB,
  ADD COLUMN "qrCode" TEXT,
  ADD COLUMN "qrCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "connectedAt" TIMESTAMP(3),
  ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Instance_workspaceId_externalInstanceId_key"
  ON "Instance"("workspaceId", "externalInstanceId");
