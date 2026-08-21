import { writeFile, mkdir, readFile, readdir, unlink, stat } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { canManageBackups } from "@/lib/policy";
import { decryptBackupBlob, encryptBackupJson } from "@/lib/backup-crypto";
import { log } from "@/lib/logger";

const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const MAX_KEEP = Number(process.env.BACKUP_MAX_KEEP || 20);

async function rotateBackups(dir: string) {
  try {
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".enc"))
      .map(async (f) => {
        const full = path.join(dir, f);
        const s = await stat(full);
        return { f, full, mtime: s.mtimeMs };
      });
    const resolved = await Promise.all(files);
    resolved.sort((a, b) => b.mtime - a.mtime);
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
    for (let i = 0; i < resolved.length; i++) {
      const item = resolved[i];
      if (i >= MAX_KEEP || item.mtime < cutoff) {
        await unlink(item.full).catch(() => undefined);
        await prisma.backupRecord.deleteMany({ where: { filename: item.f } }).catch(() => undefined);
      }
    }
  } catch {
    // ignore rotation errors
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageBackups(auth.user)) return jsonError("Forbidden — super admin only", 403);

  const file = req.nextUrl.searchParams.get("file");
  if (file) {
    if (!/^[a-zA-Z0-9._-]+\.enc$/.test(file)) return jsonError("Invalid filename", 400);
    const full = path.join(process.cwd(), "data", "backups", file);
    try {
      const buf = await readFile(full);
      const decrypt = req.nextUrl.searchParams.get("decrypt") === "1";
      await writeAudit({
        user: auth.user,
        userId: auth.user.id,
        action: decrypt ? "BACKUP_DOWNLOAD_PLAINTEXT" : "BACKUP_DOWNLOAD",
        entityType: "Backup",
        entityId: file,
        metadata: { decrypt, filename: file },
      });
      if (decrypt) {
        const json = decryptBackupBlob(buf);
        return new Response(json, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${file.replace(/\.enc$/, ".json")}"`,
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        });
      }
      return new Response(buf, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${file}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return jsonError("Backup not found", 404);
    }
  }

  const rows = await prisma.backupRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      filename: true,
      sizeBytes: true,
      notes: true,
      createdAt: true,
    },
  });
  return jsonOk({ backups: rows });
}

export async function POST() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageBackups(auth.user)) return jsonError("Forbidden — super admin only", 403);

  try {
    const includeHashes = process.env.BACKUP_INCLUDE_PASSWORD_HASHES === "1";
    const [
      locations,
      users,
      organisations,
      funding,
      events,
      programmes,
      procurements,
      submissions,
      audits,
      settings,
      categories,
      provinces,
      districts,
      municipalities,
      sources,
      invitations,
      storedObjects,
      organisationCategories,
      organisationRelationships,
      organisationClaims,
      translations,
      notificationPreferences,
      notifications,
      backgroundJobs,
      apiKeys,
    ] = await Promise.all([
      prisma.location.findMany({
        include: { category: true, province: true, district: true, municipality: true },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          provinceId: true,
          organisationId: true,
          active: true,
          locale: true,
          mustChangePassword: true,
          mfaEnabled: true,
          sessionVersion: true,
          createdAt: true,
          ...(includeHashes ? { passwordHash: true as const } : {}),
        },
      }),
      prisma.organisation.findMany(),
      prisma.fundingCall.findMany(),
      prisma.ecosystemEvent.findMany(),
      prisma.programme.findMany(),
      prisma.procurement.findMany(),
      prisma.submission.findMany(),
      prisma.auditLog.findMany({ take: 2000, orderBy: { createdAt: "desc" } }),
      prisma.appSetting.findMany(),
      prisma.category.findMany(),
      prisma.province.findMany(),
      prisma.district.findMany(),
      prisma.municipality.findMany(),
      prisma.sourceRecord.findMany(),
      prisma.adminInvitation.findMany({
        select: {
          id: true,
          email: true,
          role: true,
          provinceId: true,
          organisationId: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
      }),
      prisma.storedObject.findMany(),
      prisma.organisationCategory.findMany(),
      prisma.organisationRelationship.findMany(),
      prisma.organisationClaim.findMany(),
      prisma.translation.findMany(),
      prisma.notificationPreference.findMany(),
      prisma.notification.findMany(),
      prisma.backgroundJob.findMany(),
      prisma.apiKey.findMany(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 2,
      locations,
      users,
      organisations,
      funding,
      events,
      programmes,
      procurements,
      submissions,
      audits,
      settings,
      categories,
      provinces,
      districts,
      municipalities,
      sources,
      passwordResetTokens: [] as unknown[],
      invitations,
      storedObjects,
      organisationCategories,
      organisationRelationships,
      organisationClaims,
      translations,
      notificationPreferences,
      notifications,
      backgroundJobs,
      apiKeys,
      note:
        "Off-site copy required. Local disk is not durable on serverless. Rotate BACKUP_ENCRYPTION_KEY with dual-key procedure only.",
    };

    const backupDir = path.join(process.cwd(), "data", "backups");
    await mkdir(backupDir, { recursive: true });
    // Keep an off-site-restorable manifest for S3/object-storage content. The
    // binary objects remain in the object store; checksums and ownership data
    // make the restore verifiable and prevent silent orphaning.
    await writeFile(
      path.join(process.cwd(), "data", "object-storage-manifest.json"),
      JSON.stringify({ exportedAt: payload.exportedAt, objects: storedObjects }, null, 2),
      "utf8"
    );
    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
    const full = path.join(backupDir, filename);
    const encrypted = encryptBackupJson(JSON.stringify(payload));
    await writeFile(full, encrypted);

    if (process.env.BACKUP_OFFSITE_DIR) {
      try {
        await mkdir(process.env.BACKUP_OFFSITE_DIR, { recursive: true });
        await writeFile(path.join(process.env.BACKUP_OFFSITE_DIR, filename), encrypted);
      } catch (e) {
        log.warn("backup.offsite.failed", {
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await rotateBackups(backupDir);

    const record = await prisma.backupRecord.create({
      data: {
        filename,
        path: full,
        sizeBytes: encrypted.byteLength,
        notes: "Encrypted AES-256-GCM backup (super-admin only)",
        kind: "app-export",
        createdById: auth.user.id,
      },
    });

    await writeAudit({
      user: auth.user,
      userId: auth.user.id,
      action: "BACKUP",
      entityType: "System",
      entityId: record.id,
      metadata: { filename, sizeBytes: record.sizeBytes, encrypted: true },
    });

    log.info("backup.created", { filename, by: auth.user.id });
    return jsonOk({
      backup: record,
      download: `/api/admin/backups?file=${encodeURIComponent(filename)}`,
    });
  } catch (e) {
    log.error("backup.failed", { detail: e instanceof Error ? e.message : String(e) });
    return jsonError(e instanceof Error ? e.message : "Backup failed", 500);
  }
}
