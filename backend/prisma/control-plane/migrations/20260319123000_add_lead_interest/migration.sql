-- Create enum for lead interest workflow
CREATE TYPE "LeadInterestStatus" AS ENUM ('PENDING', 'CONTACTED', 'CONVERTED', 'ARCHIVED');

-- Create table for website interested leads
CREATE TABLE "LeadInterest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "companyName" TEXT,
  "attendantsCount" INTEGER,
  "notes" TEXT,
  "source" TEXT,
  "status" "LeadInterestStatus" NOT NULL DEFAULT 'PENDING',
  "contactedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadInterest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadInterest_status_createdAt_idx" ON "LeadInterest"("status", "createdAt");
CREATE INDEX "LeadInterest_createdAt_idx" ON "LeadInterest"("createdAt");
CREATE INDEX "LeadInterest_email_idx" ON "LeadInterest"("email");
