ALTER TABLE "Location" ADD COLUMN "retrievedAt" TIMESTAMP(3);
ALTER TABLE "Location" ADD COLUMN "sourceVersion" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "sourceVersion" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "confidence" TEXT;
