import { prisma } from "./prisma";
import { objectBackupConfigured } from "./object-backup";

export const BACKUP_KINDS = ["database", "objects", "app-export"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

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
};

const RPO_HOURS = 36;

function channelFromRow(
  kind: BackupKind,
  row: { createdAt: Date; checksumSha256: string | null; objectsCopied: number; filename: string } | null,
  configured: boolean,
  required: boolean
): ChannelHealth {
  const ageHours = row ? (Date.now() - row.createdAt.getTime()) / 36e5 : null;
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
    recordedAt: row?.createdAt.toISOString() || null,
  };
}

export async function collectBackupHealth() {
  const [database, objects, appExport] = await Promise.all([
    prisma.backupRecord.findFirst({
      where: { kind: "database" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, checksumSha256: true, objectsCopied: true, filename: true },
    }),
    prisma.backupRecord.findFirst({
      where: { kind: "objects" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, checksumSha256: true, objectsCopied: true, filename: true },
    }),
    prisma.backupRecord.findFirst({
      where: { kind: "app-export" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, checksumSha256: true, objectsCopied: true, filename: true },
    }),
  ]);
  const channels = {
    database: channelFromRow("database", database, true, true),
    objects: channelFromRow("objects", objects, objectBackupConfigured(), true),
    appExport: channelFromRow("app-export", appExport, Boolean(process.env.BACKUP_ENCRYPTION_KEY), false),
  };
  return {
    ...channels,
    stale: channels.database.stale || channels.objects.stale,
    rpoMinutes: 24 * 60,
    rtoMinutes: 120,
  };
}

export { objectBackupConfigured };
