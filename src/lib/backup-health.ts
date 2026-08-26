import { prisma } from "./prisma";
import { objectBackupConfigured } from "./object-backup";

export const BACKUP_KINDS = ["database", "objects", "app-export"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];
export const SUCCESS_BACKUP_STATUS = "SUCCESS";

export type ChannelHealth = {
  kind: BackupKind;
  ageHours: number | null;
  stale: boolean;
  required: boolean;
  checksum: string | null;
  objectsCopied: number;
  configured: boolean;
  filename: string | null;
  recordedAt: string | null;
  status: string | null;
  backupRunId: string | null;
  failureReason: string | null;
};

const RPO_HOURS = 36;

function channelFromRow(
  kind: BackupKind,
  row: {
    createdAt: Date;
    checksumSha256: string | null;
    objectsCopied: number;
    filename: string;
    status?: string | null;
    backupRunId?: string | null;
    failureReason?: string | null;
    completedAt?: Date | null;
    measuredRtoMinutes?: number | null;
  } | null,
  configured: boolean,
  required: boolean
): ChannelHealth {
  const stamp = row?.completedAt || row?.createdAt;
  const ageHours = stamp ? (Date.now() - stamp.getTime()) / 36e5 : null;
  const stale = required ? !configured || ageHours == null || ageHours > RPO_HOURS : Boolean(configured && ageHours != null && ageHours > RPO_HOURS);
  return {
    kind,
    ageHours,
    stale,
    required,
    checksum: row?.checksumSha256 || null,
    objectsCopied: row?.objectsCopied || 0,
    configured,
    filename: row?.filename || null,
    recordedAt: stamp?.toISOString() || null,
    status: row?.status || null,
    backupRunId: row?.backupRunId || null,
    failureReason: row?.failureReason || null,
  };
}

export async function collectBackupHealth() {
  const successWhere = { status: SUCCESS_BACKUP_STATUS };
  const [database, objects, appExport, latestObjectsAny] = await Promise.all([
    prisma.backupRecord.findFirst({
      where: { kind: "database", ...successWhere },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        completedAt: true,
        checksumSha256: true,
        objectsCopied: true,
        filename: true,
        status: true,
        backupRunId: true,
        failureReason: true,
        measuredRtoMinutes: true,
      },
    }),
    prisma.backupRecord.findFirst({
      where: { kind: "objects", ...successWhere },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        completedAt: true,
        checksumSha256: true,
        objectsCopied: true,
        filename: true,
        status: true,
        backupRunId: true,
        failureReason: true,
        measuredRtoMinutes: true,
      },
    }),
    prisma.backupRecord.findFirst({
      where: { kind: "app-export", ...successWhere },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        completedAt: true,
        checksumSha256: true,
        objectsCopied: true,
        filename: true,
        status: true,
        backupRunId: true,
        failureReason: true,
      },
    }),
    prisma.backupRecord.findFirst({
      where: { kind: "objects" },
      orderBy: { createdAt: "desc" },
      select: { status: true, failureReason: true, backupRunId: true, createdAt: true },
    }),
  ]);
  const channels = {
    database: channelFromRow("database", database, true, true),
    objects: channelFromRow("objects", objects, objectBackupConfigured(), true),
    appExport: channelFromRow("app-export", appExport, Boolean(process.env.BACKUP_ENCRYPTION_KEY), false),
  };
  const latestObjectsAgeHours = objects?.createdAt ? (Date.now() - (objects.completedAt || objects.createdAt).getTime()) / 36e5 : null;
  return {
    ...channels,
    stale: channels.database.stale || channels.objects.stale,
    rpoMinutes: latestObjectsAgeHours != null ? Math.round(latestObjectsAgeHours * 60) : 24 * 60,
    rtoMinutes: objects?.measuredRtoMinutes || database?.measuredRtoMinutes || 120,
    latestNonSuccessObjects: latestObjectsAny && latestObjectsAny.status !== SUCCESS_BACKUP_STATUS
      ? {
          status: latestObjectsAny.status,
          failureReason: latestObjectsAny.failureReason,
          backupRunId: latestObjectsAny.backupRunId,
          recordedAt: latestObjectsAny.createdAt.toISOString(),
        }
      : null,
  };
}

export { objectBackupConfigured };
