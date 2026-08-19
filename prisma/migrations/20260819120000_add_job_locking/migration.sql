ALTER TABLE "BackgroundJob" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "BackgroundJob" ADD COLUMN "deadLetter" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BackgroundJob" ADD COLUMN "maxRuntimeMs" INTEGER NOT NULL DEFAULT 300000;
CREATE UNIQUE INDEX "BackgroundJob_idempotencyKey_key" ON "BackgroundJob"("idempotencyKey");
