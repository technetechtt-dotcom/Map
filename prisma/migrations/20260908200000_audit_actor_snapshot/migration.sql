-- Retain immutable actor identity independently of the mutable User lifecycle.
-- The exclusive lock and transaction ensure there is no interval in which
-- application traffic can mutate AuditLog while its guard trigger is disabled.
BEGIN;

LOCK TABLE "AuditLog" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "AuditLog" DISABLE TRIGGER audit_no_update;

ALTER TABLE "AuditLog"
  ADD COLUMN "actorEmail" TEXT,
  ADD COLUMN "actorName" TEXT,
  ADD COLUMN "actorRole" TEXT;

UPDATE "AuditLog" AS audit
SET
  "actorEmail" = actor."email",
  "actorName" = actor."name",
  "actorRole" = actor."role"::TEXT
FROM "User" AS actor
WHERE audit."userId" = actor."id";

-- Keep the original actor ID as immutable evidence, but detach it from User.
-- ON DELETE SET NULL attempted to update AuditLog and was correctly rejected
-- by the append-only trigger, preventing legitimate account deletion.
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";

ALTER TABLE "AuditLog" ENABLE TRIGGER audit_no_update;

COMMIT;
