-- AlterTable
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "verificationTier" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "verificationSource" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "canonicalKey" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "sourceVersion" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "retrievedAt" TIMESTAMP(3);

UPDATE "Organisation"
SET "lastVerifiedAt" = "verifiedAt"
WHERE "lastVerifiedAt" IS NULL AND "verifiedAt" IS NOT NULL;

UPDATE "Organisation"
SET "verificationTier" = 'desktop'
WHERE "verified" = TRUE AND ("verificationTier" IS NULL OR "verificationTier" = 'unverified');

UPDATE "Location"
SET "verificationExpiresAt" = ("lastVerifiedAt" + INTERVAL '365 days')
WHERE "lastVerifiedAt" IS NOT NULL AND "verificationExpiresAt" IS NULL;

UPDATE "Organisation"
SET "verificationExpiresAt" = (COALESCE("lastVerifiedAt", "verifiedAt") + INTERVAL '365 days')
WHERE COALESCE("lastVerifiedAt", "verifiedAt") IS NOT NULL AND "verificationExpiresAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Organisation_canonicalKey_key" ON "Organisation"("canonicalKey");
CREATE INDEX IF NOT EXISTS "Organisation_verificationTier_idx" ON "Organisation"("verificationTier");
CREATE INDEX IF NOT EXISTS "Organisation_externalId_idx" ON "Organisation"("externalId");
CREATE INDEX IF NOT EXISTS "Location_externalId_idx" ON "Location"("externalId");

-- AlterTable
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "etag" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- AlterTable
ALTER TABLE "BackupRecord" ADD COLUMN IF NOT EXISTS "cursorJson" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalIdentity_connector_externalId_entityType_key"
  ON "ExternalIdentity"("connector", "externalId", "entityType");
CREATE INDEX IF NOT EXISTS "ExternalIdentity_entityType_entityId_idx"
  ON "ExternalIdentity"("entityType", "entityId");
