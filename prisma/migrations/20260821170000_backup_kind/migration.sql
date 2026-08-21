-- AlterTable
ALTER TABLE "BackupRecord" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'app-export';

-- CreateIndex
CREATE INDEX "BackupRecord_kind_createdAt_idx" ON "BackupRecord"("kind", "createdAt");
