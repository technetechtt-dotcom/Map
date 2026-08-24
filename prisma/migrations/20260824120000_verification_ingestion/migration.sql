-- AlterTable
ALTER TABLE "Location" ADD COLUMN "verificationTier" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "Location" ADD COLUMN "canonicalKey" TEXT;

-- AlterTable
ALTER TABLE "SourceRecord" ADD COLUMN "connector" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "retrievedAt" TIMESTAMP(3);
ALTER TABLE "SourceRecord" ADD COLUMN "licence" TEXT;

-- CreateTable
CREATE TABLE "IngestionChange" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "canonicalKey" TEXT,
    "beforeJson" JSONB NOT NULL DEFAULT '{}',
    "afterJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Location_canonicalKey_key" ON "Location"("canonicalKey");
CREATE INDEX "Location_verificationTier_idx" ON "Location"("verificationTier");
CREATE INDEX "IngestionChange_locationId_createdAt_idx" ON "IngestionChange"("locationId", "createdAt");
CREATE INDEX "IngestionChange_connector_createdAt_idx" ON "IngestionChange"("connector", "createdAt");

ALTER TABLE "IngestionChange" ADD CONSTRAINT "IngestionChange_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Location"
SET "verificationTier" = CASE
  WHEN "coordQuality" = 'verified' AND "lastVerifiedAt" IS NOT NULL THEN 'field'
  WHEN "lastVerifiedAt" IS NOT NULL THEN 'desktop'
  WHEN "sourceConfidence" IN ('public-directory', 'directory') OR "coordQuality" = 'directory-only' THEN 'directory'
  ELSE 'unverified'
END;
