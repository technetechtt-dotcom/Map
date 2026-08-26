-- Backup run states and metrics. Existing rows are treated as SUCCESS so RPO
-- continues from historically completed backups rather than flipping stale.
ALTER TABLE "BackupRecord" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "BackupRecord" ADD COLUMN "backupRunId" TEXT;
ALTER TABLE "BackupRecord" ADD COLUMN "attemptedObjects" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BackupRecord" ADD COLUMN "copiedObjects" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BackupRecord" ADD COLUMN "verifiedObjects" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BackupRecord" ADD COLUMN "failedObjects" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BackupRecord" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "BackupRecord" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "BackupRecord" ADD COLUMN "manifestHash" TEXT;
ALTER TABLE "BackupRecord" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "BackupRecord" ADD COLUMN "measuredRtoMinutes" INTEGER;
CREATE UNIQUE INDEX "BackupRecord_backupRunId_key" ON "BackupRecord"("backupRunId");
CREATE INDEX "BackupRecord_kind_status_createdAt_idx" ON "BackupRecord"("kind", "status", "createdAt");

ALTER TABLE "Location" ADD COLUMN "lastObservedAt" TIMESTAMP(3);
ALTER TABLE "Location" ADD COLUMN "missingFromSource" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Location" ADD COLUMN "consecutiveMisses" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Location_lastObservedAt_idx" ON "Location"("lastObservedAt");
CREATE INDEX "Location_missingFromSource_consecutiveMisses_idx" ON "Location"("missingFromSource", "consecutiveMisses");

ALTER TABLE "ImportBatch" ADD COLUMN "etag" TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "retrievedAt" TIMESTAMP(3);
ALTER TABLE "ImportBatch" ADD COLUMN "schemaDrift" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "ImportBatch_source_retrievedAt_idx" ON "ImportBatch"("source", "retrievedAt");

ALTER TYPE "RelationshipType" ADD VALUE IF NOT EXISTS 'PARENT_OF';
ALTER TYPE "RelationshipType" ADD VALUE IF NOT EXISTS 'HOSTS';
ALTER TYPE "RelationshipType" ADD VALUE IF NOT EXISTS 'DELIVERS_PROGRAMME';

CREATE TABLE "ObjectBackupReplica" (
    "id" TEXT NOT NULL,
    "storedObjectId" TEXT NOT NULL,
    "backupKey" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "lastCopiedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "copyStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ObjectBackupReplica_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ObjectBackupReplica_backupKey_key" ON "ObjectBackupReplica"("backupKey");
CREATE INDEX "ObjectBackupReplica_storedObjectId_idx" ON "ObjectBackupReplica"("storedObjectId");
CREATE INDEX "ObjectBackupReplica_copyStatus_lastVerifiedAt_idx" ON "ObjectBackupReplica"("copyStatus", "lastVerifiedAt");
ALTER TABLE "ObjectBackupReplica" ADD CONSTRAINT "ObjectBackupReplica_storedObjectId_fkey" FOREIGN KEY ("storedObjectId") REFERENCES "StoredObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SourceObservation" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "consecutiveMisses" INTEGER NOT NULL DEFAULT 0,
    "missingFromSource" BOOLEAN NOT NULL DEFAULT false,
    "sourceVersion" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SourceObservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SourceObservation_entityType_entityId_connector_key" ON "SourceObservation"("entityType", "entityId", "connector");
CREATE INDEX "SourceObservation_connector_lastSeenAt_idx" ON "SourceObservation"("connector", "lastSeenAt");
CREATE INDEX "SourceObservation_missingFromSource_consecutiveMisses_idx" ON "SourceObservation"("missingFromSource", "consecutiveMisses");

CREATE TABLE "FieldAuthority" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "authority" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FieldAuthority_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FieldAuthority_entityType_entityId_field_key" ON "FieldAuthority"("entityType", "entityId", "field");
CREATE INDEX "FieldAuthority_entityType_entityId_idx" ON "FieldAuthority"("entityType", "entityId");

CREATE TABLE "EntityReviewAction" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT,
    "actorId" TEXT,
    "notes" TEXT,
    "beforeJson" JSONB NOT NULL DEFAULT '{}',
    "afterJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityReviewAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EntityReviewAction_entityType_sourceId_createdAt_idx" ON "EntityReviewAction"("entityType", "sourceId", "createdAt");
CREATE INDEX "EntityReviewAction_action_createdAt_idx" ON "EntityReviewAction"("action", "createdAt");

CREATE TABLE "ReverificationCampaign" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueBefore" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "locationCount" INTEGER NOT NULL DEFAULT 0,
    "organisationCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReverificationCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReverificationCampaign_status_dueBefore_idx" ON "ReverificationCampaign"("status", "dueBefore");

CREATE TABLE "IngestionConnectorRun" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "sourceVersion" TEXT,
    "contentHash" TEXT,
    "etag" TEXT,
    "sourceUrl" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "schemaDrift" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "latencyMs" INTEGER,
    CONSTRAINT "IngestionConnectorRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IngestionConnectorRun_connector_startedAt_idx" ON "IngestionConnectorRun"("connector", "startedAt");

CREATE TABLE "NationalEntity" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "domain" TEXT,
    "provinceSlug" TEXT,
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "evidenceJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NationalEntity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NationalEntity_canonicalId_key" ON "NationalEntity"("canonicalId");
CREATE INDEX "NationalEntity_entityType_domain_idx" ON "NationalEntity"("entityType", "domain");
CREATE INDEX "NationalEntity_registrationNumber_idx" ON "NationalEntity"("registrationNumber");
CREATE INDEX "NationalEntity_linkedEntityType_linkedEntityId_idx" ON "NationalEntity"("linkedEntityType", "linkedEntityId");
