CREATE TYPE "SocialAuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

ALTER TABLE "GlobalUser"
ADD COLUMN "avatarStoragePath" TEXT;

CREATE TABLE "GlobalUserSocialAccount" (
  "id" TEXT NOT NULL,
  "globalUserId" TEXT NOT NULL,
  "provider" "SocialAuthProvider" NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "GlobalUserSocialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalUserSocialAccount_globalUserId_provider_key"
ON "GlobalUserSocialAccount"("globalUserId", "provider");

CREATE UNIQUE INDEX "GlobalUserSocialAccount_provider_providerUserId_key"
ON "GlobalUserSocialAccount"("provider", "providerUserId");

CREATE INDEX "GlobalUserSocialAccount_globalUserId_provider_idx"
ON "GlobalUserSocialAccount"("globalUserId", "provider");

ALTER TABLE "GlobalUserSocialAccount"
ADD CONSTRAINT "GlobalUserSocialAccount_globalUserId_fkey"
FOREIGN KEY ("globalUserId") REFERENCES "GlobalUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
