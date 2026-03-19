-- Add optional link to control-plane global user identity
ALTER TABLE "User"
ADD COLUMN "globalUserId" TEXT;

CREATE UNIQUE INDEX "User_globalUserId_key" ON "User"("globalUserId");
CREATE INDEX "User_workspaceId_globalUserId_idx" ON "User"("workspaceId", "globalUserId");
