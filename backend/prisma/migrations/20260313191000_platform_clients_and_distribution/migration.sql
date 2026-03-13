-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WINDOWS', 'MACOS', 'WEB');

-- CreateEnum
CREATE TYPE "DeviceProvider" AS ENUM ('EXPO', 'DESKTOP_LOCAL', 'WEB');

-- CreateTable
CREATE TABLE "ClientDevice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "provider" "DeviceProvider" NOT NULL,
    "pushToken" TEXT,
    "deviceName" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "buildNumber" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientDevice_userId_installationId_key" ON "ClientDevice"("userId", "installationId");

-- CreateIndex
CREATE INDEX "ClientDevice_workspaceId_userId_revokedAt_idx" ON "ClientDevice"("workspaceId", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "ClientDevice_workspaceId_pushToken_idx" ON "ClientDevice"("workspaceId", "pushToken");

-- AddForeignKey
ALTER TABLE "ClientDevice" ADD CONSTRAINT "ClientDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDevice" ADD CONSTRAINT "ClientDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
