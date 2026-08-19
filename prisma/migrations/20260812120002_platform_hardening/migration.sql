CREATE TYPE "RelationshipType" AS ENUM ('PARTNER_OF', 'FUNDED_BY', 'SUPPLIER_TO', 'INCUBATED_BY', 'TRAINED_BY', 'MEMBER_OF', 'INVESTED_IN');
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

ALTER TABLE "User"
  ADD COLUMN "mfaPendingSecret" TEXT,
  ADD COLUMN "mfaPendingKeyVersion" INTEGER;

CREATE TABLE "OrganisationCategory" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "OrganisationCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganisationCategory_slug_key" ON "OrganisationCategory"("slug");
CREATE UNIQUE INDEX "OrganisationCategory_name_key" ON "OrganisationCategory"("name");

ALTER TABLE "Organisation"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "servicesJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "skillsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "technologiesJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "certificationsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "serviceAreasJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "industrySectorsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "portfolioJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "companySize" TEXT,
  ADD COLUMN "cipcNumber" TEXT,
  ADD COLUMN "beeLevel" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verificationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "verificationEvidenceJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "OrganisationCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Organisation_categoryId_idx" ON "Organisation"("categoryId");
CREATE INDEX "Organisation_verificationExpiresAt_idx" ON "Organisation"("verificationExpiresAt");

CREATE TABLE "OrganisationRelationship" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "type" "RelationshipType" NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
  "evidenceJson" JSONB NOT NULL DEFAULT '[]',
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganisationRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganisationRelationship_no_self" CHECK ("sourceId" <> "targetId")
);
ALTER TABLE "OrganisationRelationship" ADD CONSTRAINT "OrganisationRelationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganisationRelationship" ADD CONSTRAINT "OrganisationRelationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "OrganisationRelationship_sourceId_targetId_type_key" ON "OrganisationRelationship"("sourceId", "targetId", "type");
CREATE INDEX "OrganisationRelationship_targetId_type_status_idx" ON "OrganisationRelationship"("targetId", "type", "status");
CREATE INDEX "OrganisationRelationship_sourceId_type_status_idx" ON "OrganisationRelationship"("sourceId", "type", "status");

CREATE TABLE "OrganisationClaim" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "claimantId" TEXT NOT NULL,
  "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
  "evidenceJson" JSONB NOT NULL DEFAULT '[]',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganisationClaim_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "OrganisationClaim" ADD CONSTRAINT "OrganisationClaim_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganisationClaim" ADD CONSTRAINT "OrganisationClaim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "OrganisationClaim_organisationId_claimantId_status_key" ON "OrganisationClaim"("organisationId", "claimantId", "status");
CREATE INDEX "OrganisationClaim_status_createdAt_idx" ON "OrganisationClaim"("status", "createdAt");

ALTER TABLE "ImportBatch"
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourceVersion" TEXT,
  ADD COLUMN "checksumSha256" TEXT,
  ADD COLUMN "licence" TEXT;

CREATE TABLE "Translation" (
  "id" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "field" TEXT NOT NULL, "locale" TEXT NOT NULL, "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Translation_entityType_entityId_field_locale_key" ON "Translation"("entityType", "entityId", "field", "locale");
CREATE INDEX "Translation_locale_entityType_idx" ON "Translation"("locale", "entityType");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL, "userId" TEXT, "email" TEXT, "type" TEXT NOT NULL,
  "subject" TEXT NOT NULL, "body" TEXT NOT NULL, "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3), "lastError" TEXT, "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Notification_status_scheduledAt_idx" ON "Notification"("status", "scheduledAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "email" BOOLEAN NOT NULL DEFAULT true, "inApp" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreference_userId_eventType_key" ON "NotificationPreference"("userId", "eventType");

CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL, "type" TEXT NOT NULL, "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "payloadJson" JSONB NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3), "lockedBy" TEXT,
  "lastError" TEXT, "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BackgroundJob_status_runAfter_idx" ON "BackgroundJob"("status", "runAfter");
CREATE INDEX "BackgroundJob_type_createdAt_idx" ON "BackgroundJob"("type", "createdAt");

CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "prefix" TEXT NOT NULL, "keyHash" TEXT NOT NULL,
  "userId" TEXT, "organisationId" TEXT, "scopesJson" JSONB NOT NULL DEFAULT '[]', "rateLimit" INTEGER NOT NULL DEFAULT 600,
  "active" BOOLEAN NOT NULL DEFAULT true, "expiresAt" TIMESTAMP(3), "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_organisationId_active_idx" ON "ApiKey"("organisationId", "active");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP INDEX IF EXISTS location_fts_idx;
CREATE INDEX location_fts_idx ON "Location" USING GIN (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, ''))
);
CREATE INDEX location_name_trgm_idx ON "Location" USING GIN (name gin_trgm_ops);
CREATE INDEX organisation_name_trgm_idx ON "Organisation" USING GIN (name gin_trgm_ops);
CREATE INDEX organisation_fts_idx ON "Organisation" USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(type, '')));
CREATE INDEX funding_fts_idx ON "FundingCall" USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '')));
CREATE INDEX procurement_fts_idx ON "Procurement" USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '')));
CREATE INDEX event_fts_idx ON "EcosystemEvent" USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '')));
CREATE INDEX programme_fts_idx ON "Programme" USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '')));

ALTER TABLE "Location" ADD CONSTRAINT "Location_coordQuality_check"
  CHECK ("coordQuality" IN ('verified', 'estimated', 'town-centre', 'unknown', 'directory-only'));
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_coordQuality_check"
  CHECK ("coordQuality" IS NULL OR "coordQuality" IN ('verified', 'estimated', 'town-centre', 'unknown', 'directory-only'));
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_type_check"
  CHECK ("type" IN ('access', 'correction', 'deletion', 'withdraw_consent'));
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_targetType_check"
  CHECK ("targetType" IN ('location', 'organisation', 'funding', 'procurement', 'event', 'programme'));
