ALTER TABLE "Location"
  ADD COLUMN IF NOT EXISTS "sourceConfidence" TEXT,
  ADD COLUMN IF NOT EXISTS "boundaryValid" TEXT,
  ADD COLUMN IF NOT EXISTS "staleAt" TIMESTAMP(3);

ALTER TABLE "Organisation"
  ADD COLUMN IF NOT EXISTS "aliasesJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "sourceConfidence" TEXT,
  ADD COLUMN IF NOT EXISTS "confidenceScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT;
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Organisation_mergedIntoId_idx" ON "Organisation"("mergedIntoId");

ALTER TABLE "FundingCall"
  ADD COLUMN IF NOT EXISTS "fundingType" TEXT,
  ADD COLUMN IF NOT EXISTS "minAmount" TEXT,
  ADD COLUMN IF NOT EXISTS "maxAmount" TEXT,
  ADD COLUMN IF NOT EXISTS "eligibleSectorsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "businessStage" TEXT,
  ADD COLUMN IF NOT EXISTS "geography" TEXT,
  ADD COLUMN IF NOT EXISTS "ownershipCriteria" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationRequirements" TEXT,
  ADD COLUMN IF NOT EXISTS "instrument" TEXT,
  ADD COLUMN IF NOT EXISTS "openingDate" TIMESTAMP(3);

ALTER TABLE "Procurement"
  ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "issuingAuthority" TEXT,
  ADD COLUMN IF NOT EXISTS "procurementCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "briefingAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closingTime" TEXT,
  ADD COLUMN IF NOT EXISTS "valueRange" TEXT,
  ADD COLUMN IF NOT EXISTS "documentsJson" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "BackupRecord"
  ADD COLUMN IF NOT EXISTS "checksumSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "objectsCopied" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rpoMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "rtoMinutes" INTEGER;

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "bouncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receiptId" TEXT;

ALTER TABLE "BackgroundJob"
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "BackgroundJob_leaseExpiresAt_idx" ON "BackgroundJob"("leaseExpiresAt");

ALTER TABLE "ApiKey"
  ADD COLUMN IF NOT EXISTS "allowedCidrsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "rotatedFromId" TEXT;

CREATE TABLE IF NOT EXISTS "MfaRecoveryRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MfaRecoveryRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MfaRecoveryRequest_tokenHash_key" ON "MfaRecoveryRequest"("tokenHash");
CREATE INDEX IF NOT EXISTS "MfaRecoveryRequest_userId_status_idx" ON "MfaRecoveryRequest"("userId", "status");
CREATE INDEX IF NOT EXISTS "MfaRecoveryRequest_status_createdAt_idx" ON "MfaRecoveryRequest"("status", "createdAt");
ALTER TABLE "MfaRecoveryRequest" ADD CONSTRAINT "MfaRecoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryRequest" ADD CONSTRAINT "MfaRecoveryRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryRequest" ADD CONSTRAINT "MfaRecoveryRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SearchSynonym" (
  "id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "synonymsJson" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SearchSynonym_term_locale_key" ON "SearchSynonym"("term", "locale");

INSERT INTO "SearchSynonym" ("id", "term", "locale", "synonymsJson", "updatedAt")
VALUES
  ('syn_hub', 'hub', 'en', '["incubator","innovation centre","digital centre"]', CURRENT_TIMESTAMP),
  ('syn_funding', 'funding', 'en', '["grant","finance","investment"]', CURRENT_TIMESTAMP),
  ('syn_training', 'training', 'en', '["skills","course","programme"]', CURRENT_TIMESTAMP),
  ('syn_tender', 'tender', 'en', '["procurement","bid","rfp"]', CURRENT_TIMESTAMP)
ON CONFLICT ("term", "locale") DO NOTHING;

INSERT INTO "SearchSynonym" ("id", "term", "locale", "synonymsJson", "updatedAt")
VALUES
  ('syn_hub_af', 'hub', 'af', '["broeikas","innovasiesentrum"]', CURRENT_TIMESTAMP),
  ('syn_funding_af', 'befondsing', 'af', '["toekenning","finansiering"]', CURRENT_TIMESTAMP)
ON CONFLICT ("term", "locale") DO NOTHING;

CREATE TABLE IF NOT EXISTS "WorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "queueDepth" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerHeartbeat_workerId_key" ON "WorkerHeartbeat"("workerId");

CREATE TABLE IF NOT EXISTS "OrganisationMerge" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "performedById" TEXT,
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganisationMerge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrganisationMerge_targetId_createdAt_idx" ON "OrganisationMerge"("targetId", "createdAt");
