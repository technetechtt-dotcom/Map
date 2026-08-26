import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { authorizeCronSecret } from "@/lib/ops-auth";
import { BACKUP_KINDS, type BackupKind } from "@/lib/backup-health";
import { readJsonLimited } from "@/lib/security";

const STATUSES = new Set(["STARTED", "SUCCESS", "PARTIAL", "FAILED"]);

/** Record channel backup success from scheduled dump/copy jobs. */
export async function POST(req: NextRequest) {
  const cron = authorizeCronSecret(req);
  if (!cron.ok) return jsonError(cron.error, cron.status);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    kind?: string;
    filename?: string;
    path?: string;
    sizeBytes?: number;
    checksumSha256?: string;
    objectsCopied?: number;
    cursorJson?: unknown;
    status?: string;
    backupRunId?: string;
    attemptedObjects?: number;
    copiedObjects?: number;
    verifiedObjects?: number;
    failedObjects?: number;
    startedAt?: string;
    completedAt?: string;
    manifestHash?: string;
    failureReason?: string;
    rpoMinutes?: number;
    measuredRtoMinutes?: number;
  };
  if (!BACKUP_KINDS.includes((body.kind || "") as BackupKind)) {
    return jsonError("kind must be database, objects, or app-export", 400);
  }
  const status = STATUSES.has(String(body.status || "")) ? String(body.status) : "SUCCESS";
  const data = {
    kind: body.kind as BackupKind,
    filename: String(body.filename || `${body.kind}-${new Date().toISOString()}`).slice(0, 200),
    path: String(body.path || "offsite").slice(0, 500),
    sizeBytes: Number.isFinite(body.sizeBytes) ? Number(body.sizeBytes) : 0,
    checksumSha256: body.checksumSha256 || null,
    objectsCopied: Number.isFinite(body.objectsCopied) ? Number(body.objectsCopied) : 0,
    lastVerifiedAt: new Date(),
    rpoMinutes: Number.isFinite(body.rpoMinutes) ? Number(body.rpoMinutes) : 24 * 60,
    rtoMinutes: 120,
    notes: "Recorded by scheduled backup pipeline",
    cursorJson: body.cursorJson && typeof body.cursorJson === "object" ? body.cursorJson : undefined,
    status,
    backupRunId: body.backupRunId || undefined,
    attemptedObjects: Number.isFinite(body.attemptedObjects) ? Number(body.attemptedObjects) : 0,
    copiedObjects: Number.isFinite(body.copiedObjects) ? Number(body.copiedObjects) : Number(body.objectsCopied) || 0,
    verifiedObjects: Number.isFinite(body.verifiedObjects) ? Number(body.verifiedObjects) : 0,
    failedObjects: Number.isFinite(body.failedObjects) ? Number(body.failedObjects) : 0,
    startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
    completedAt: body.completedAt ? new Date(body.completedAt) : new Date(),
    manifestHash: body.manifestHash || body.checksumSha256 || null,
    failureReason: body.failureReason || null,
    measuredRtoMinutes: Number.isFinite(body.measuredRtoMinutes) ? Number(body.measuredRtoMinutes) : null,
  };
  if (body.backupRunId) {
    const existing = await prisma.backupRecord.findUnique({ where: { backupRunId: body.backupRunId } });
    if (existing) {
      const record = await prisma.backupRecord.update({ where: { id: existing.id }, data });
      return jsonOk({ id: record.id, kind: record.kind, status: record.status, backupRunId: record.backupRunId });
    }
  }
  const record = await prisma.backupRecord.create({ data });
  return jsonOk({ id: record.id, kind: record.kind, status: record.status, backupRunId: record.backupRunId });
}
