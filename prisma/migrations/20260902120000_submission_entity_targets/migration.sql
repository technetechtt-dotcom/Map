-- Community submissions can create ecosystem records, not only locations.
ALTER TABLE "Submission" ADD COLUMN "createdEntityType" TEXT;
ALTER TABLE "Submission" ADD COLUMN "createdEntityId" TEXT;
UPDATE "Submission" SET "createdEntityType" = 'location', "createdEntityId" = "createdLocationId" WHERE "createdLocationId" IS NOT NULL;
CREATE INDEX "Submission_createdEntityType_createdEntityId_idx" ON "Submission"("createdEntityType", "createdEntityId");
