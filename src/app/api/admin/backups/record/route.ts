import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { authorizeCronSecret } from "@/lib/ops-auth";
import { BACKUP_KINDS, type BackupKind } from "@/lib/backup-health";
import { readJsonLimited } from "@/lib/security";

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
  };
  if (!BACKUP_KINDS.includes((body.kind || "") as BackupKind)) {
    return jsonError("kind must be database, objects, or app-export", 400);
  }
  const record = await prisma.backupRecord.create({
    data: {
      kind: body.kind as BackupKind,
      filename: String(body.filename || `${body.kind}-${new Date().toISOString()}`).slice(0, 200),
      path: String(body.path || "offsite").slice(0, 500),
      sizeBytes: Number.isFinite(body.sizeBytes) ? Number(body.sizeBytes) : 0,
      checksumSha256: body.checksumSha256 || null,
      objectsCopied: Number.isFinite(body.objectsCopied) ? Number(body.objectsCopied) : 0,
      lastVerifiedAt: new Date(),
      rpoMinutes: 24 * 60,
      rtoMinutes: 120,
      notes: "Recorded by scheduled backup pipeline",
      cursorJson: body.cursorJson && typeof body.cursorJson === "object" ? body.cursorJson : undefined,
    },
  });
  return jsonOk({ id: record.id, kind: record.kind });
}
