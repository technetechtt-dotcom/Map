-- Expand submission workflow and public product models.

ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'NEEDS_INFORMATION';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'DUPLICATE_SUSPECTED';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';

ALTER TABLE "FundingCall" ADD COLUMN IF NOT EXISTS "targetAudience" TEXT;
ALTER TABLE "FundingCall" ADD COLUMN IF NOT EXISTS "applicationProcess" TEXT;
ALTER TABLE "FundingCall" ADD COLUMN IF NOT EXISTS "applicationUrl" TEXT;

ALTER TABLE "EcosystemEvent" ADD COLUMN IF NOT EXISTS "town" TEXT;
ALTER TABLE "EcosystemEvent" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "EcosystemEvent" ADD COLUMN IF NOT EXISTS "cost" TEXT;
ALTER TABLE "EcosystemEvent" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "EcosystemEvent" ADD COLUMN IF NOT EXISTS "attendanceFormat" TEXT;

ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "audience" TEXT;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "ageGroup" TEXT;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "skillsCategory" TEXT;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "deliveryMethod" TEXT;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "providerName" TEXT;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "applicationStatus" TEXT;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "eligibility" TEXT;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "Programme" ADD COLUMN IF NOT EXISTS "applicationUrl" TEXT;

ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "trackingRef" TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "mergeTargetId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Submission_trackingRef_key" ON "Submission"("trackingRef");
CREATE INDEX IF NOT EXISTS "Submission_assignedToId_idx" ON "Submission"("assignedToId");

ALTER TABLE "DataSubjectRequest" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "DataSubjectRequest" ADD COLUMN IF NOT EXISTS "identityVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DataSubjectRequest" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "DataSubjectRequest" ADD COLUMN IF NOT EXISTS "responseNotes" TEXT;

ALTER TABLE "CorrectionRequest" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "CorrectionRequest" ADD COLUMN IF NOT EXISTS "investigationNotes" TEXT;
ALTER TABLE "CorrectionRequest" ADD COLUMN IF NOT EXISTS "resolution" TEXT;

CREATE TABLE IF NOT EXISTS "SavedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavedItem_userId_kind_slug_key" ON "SavedItem"("userId", "kind", "slug");
CREATE INDEX IF NOT EXISTS "SavedItem_userId_createdAt_idx" ON "SavedItem"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Submission_assignedToId_fkey'
  ) THEN
    ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DataSubjectRequest_assignedToId_fkey'
  ) THEN
    ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CorrectionRequest_assignedToId_fkey'
  ) THEN
    ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SavedItem_userId_fkey'
  ) THEN
    ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
