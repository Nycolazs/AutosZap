-- Create enums
CREATE TYPE "GlobalUserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'PENDING');
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT');
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'INACTIVE');
CREATE TYPE "TenantRole" AS ENUM ('ADMIN', 'MANAGER', 'AGENT', 'SELLER');
CREATE TYPE "TenantDatabaseStatus" AS ENUM ('PROVISIONING', 'READY', 'FAILED', 'INACTIVE');
CREATE TYPE "ProvisioningJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "PlatformAuditAction" AS ENUM (
  'LOGIN',
  'LOGIN_FAILED',
  'COMPANY_CREATED',
  'COMPANY_UPDATED',
  'COMPANY_PROVISIONED',
  'USER_CREATED',
  'USER_UPDATED',
  'MEMBERSHIP_CREATED',
  'MEMBERSHIP_UPDATED',
  'SECURITY_EVENT'
);

-- Create tables
CREATE TABLE "GlobalUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" "GlobalUserStatus" NOT NULL DEFAULT 'ACTIVE',
  "platformRole" "PlatformRole",
  "blockedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "GlobalUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "workspaceId" TEXT NOT NULL,
  "featureFlags" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deactivatedAt" TIMESTAMP(3),
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyMembership" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "globalUserId" TEXT NOT NULL,
  "tenantRole" "TenantRole" NOT NULL DEFAULT 'SELLER',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantDatabase" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "databaseName" TEXT NOT NULL,
  "databaseHost" TEXT,
  "databasePort" INTEGER,
  "databaseSchema" TEXT,
  "connectionUrlEncrypted" TEXT NOT NULL,
  "status" "TenantDatabaseStatus" NOT NULL DEFAULT 'PROVISIONING',
  "provisionedAt" TIMESTAMP(3),
  "lastMigrationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantDatabase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlobalRefreshToken" (
  "id" TEXT NOT NULL,
  "globalUserId" TEXT NOT NULL,
  "companyId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlobalRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlobalPasswordResetToken" (
  "id" TEXT NOT NULL,
  "globalUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlobalPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantProvisioningJob" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestedById" TEXT,
  "status" "ProvisioningJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantProvisioningJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformAuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" "PlatformAuditAction" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "GlobalUser_email_key" ON "GlobalUser"("email");
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
CREATE UNIQUE INDEX "Company_workspaceId_key" ON "Company"("workspaceId");
CREATE UNIQUE INDEX "CompanyMembership_companyId_globalUserId_key" ON "CompanyMembership"("companyId", "globalUserId");
CREATE UNIQUE INDEX "TenantDatabase_companyId_key" ON "TenantDatabase"("companyId");
CREATE UNIQUE INDEX "GlobalRefreshToken_tokenHash_key" ON "GlobalRefreshToken"("tokenHash");
CREATE UNIQUE INDEX "GlobalPasswordResetToken_tokenHash_key" ON "GlobalPasswordResetToken"("tokenHash");

-- Secondary indexes
CREATE INDEX "CompanyMembership_globalUserId_status_idx" ON "CompanyMembership"("globalUserId", "status");
CREATE INDEX "CompanyMembership_companyId_status_idx" ON "CompanyMembership"("companyId", "status");
CREATE INDEX "GlobalRefreshToken_globalUserId_expiresAt_idx" ON "GlobalRefreshToken"("globalUserId", "expiresAt");
CREATE INDEX "GlobalRefreshToken_companyId_expiresAt_idx" ON "GlobalRefreshToken"("companyId", "expiresAt");
CREATE INDEX "GlobalPasswordResetToken_globalUserId_expiresAt_idx" ON "GlobalPasswordResetToken"("globalUserId", "expiresAt");
CREATE INDEX "TenantProvisioningJob_companyId_createdAt_idx" ON "TenantProvisioningJob"("companyId", "createdAt");
CREATE INDEX "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");
CREATE INDEX "PlatformAuditLog_entityType_entityId_createdAt_idx" ON "PlatformAuditLog"("entityType", "entityId", "createdAt");

-- Foreign keys
ALTER TABLE "CompanyMembership"
ADD CONSTRAINT "CompanyMembership_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyMembership"
ADD CONSTRAINT "CompanyMembership_globalUserId_fkey"
FOREIGN KEY ("globalUserId") REFERENCES "GlobalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantDatabase"
ADD CONSTRAINT "TenantDatabase_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalRefreshToken"
ADD CONSTRAINT "GlobalRefreshToken_globalUserId_fkey"
FOREIGN KEY ("globalUserId") REFERENCES "GlobalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalRefreshToken"
ADD CONSTRAINT "GlobalRefreshToken_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GlobalPasswordResetToken"
ADD CONSTRAINT "GlobalPasswordResetToken_globalUserId_fkey"
FOREIGN KEY ("globalUserId") REFERENCES "GlobalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantProvisioningJob"
ADD CONSTRAINT "TenantProvisioningJob_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantProvisioningJob"
ADD CONSTRAINT "TenantProvisioningJob_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "GlobalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlatformAuditLog"
ADD CONSTRAINT "PlatformAuditLog_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "GlobalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
