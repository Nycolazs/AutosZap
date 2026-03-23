ALTER TABLE "User"
ADD COLUMN "workspaceRoleId" TEXT;

ALTER TABLE "TeamMember"
ADD COLUMN "workspaceRoleId" TEXT;

CREATE TABLE "WorkspaceRole" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "WorkspaceRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceRolePermission" (
  "id" TEXT NOT NULL,
  "workspaceRoleId" TEXT NOT NULL,
  "permission" "PermissionKey" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceRole_workspaceId_name_key"
ON "WorkspaceRole"("workspaceId", "name");

CREATE INDEX "WorkspaceRole_workspaceId_deletedAt_idx"
ON "WorkspaceRole"("workspaceId", "deletedAt");

CREATE UNIQUE INDEX "WorkspaceRolePermission_workspaceRoleId_permission_key"
ON "WorkspaceRolePermission"("workspaceRoleId", "permission");

CREATE INDEX "WorkspaceRolePermission_permission_idx"
ON "WorkspaceRolePermission"("permission");

CREATE INDEX "User_workspaceRoleId_idx"
ON "User"("workspaceRoleId");

CREATE INDEX "TeamMember_workspaceRoleId_idx"
ON "TeamMember"("workspaceRoleId");

ALTER TABLE "WorkspaceRole"
ADD CONSTRAINT "WorkspaceRole_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRolePermission"
ADD CONSTRAINT "WorkspaceRolePermission_workspaceRoleId_fkey"
FOREIGN KEY ("workspaceRoleId") REFERENCES "WorkspaceRole"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_workspaceRoleId_fkey"
FOREIGN KEY ("workspaceRoleId") REFERENCES "WorkspaceRole"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
ADD CONSTRAINT "TeamMember_workspaceRoleId_fkey"
FOREIGN KEY ("workspaceRoleId") REFERENCES "WorkspaceRole"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
