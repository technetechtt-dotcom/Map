import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { canManageBackups } from "@/lib/policy";
import { decryptBackupBlob, encryptBackupJson } from "@/lib/backup-crypto";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageBackups(auth.user)) return jsonError("Forbidden — super admin only", 403);

  const file = req.nextUrl.searchParams.get("file");
  if (file) {
    // Download encrypted blob only (no plaintext user data over JSON API list)
    if (!/^[a-zA-Z0-9._-]+\.enc$/.test(file)) return jsonError("Invalid filename", 400);
    const full = path.join(process.cwd(), "data", "backups", file);
    try {
      const buf = await readFile(full);
      // Optional decrypt with ?decrypt=1 for restore tooling
      if (req.nextUrl.searchParams.get("decrypt") === "1") {
        const json = decryptBackupBlob(buf);
        return new Response(json, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${file.replace(/\.enc$/, ".json")}"`,
          },
        });
      }
      return new Response(buf, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${file}"`,
        },
      });
    } catch {
      return jsonError("Backup not found", 404);
    }
  }

  // List metadata only
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
          createdAt: true,
          // never export passwordHash
        },
      }),
      prisma.organisation.findMany(),
      prisma.fundingCall.findMany(),
      prisma.ecosystemEvent.findMany(),
      prisma.programme.findMany(),
      prisma.procurement.findMany(),
      prisma.submission.findMany(),
      prisma.auditLog.findMany({ take: 500, orderBy: { createdAt: "desc" } }),
      prisma.appSetting.findMany(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
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
    };

    const backupDir = path.join(process.cwd(), "data", "backups");
    await mkdir(backupDir, { recursive: true });
    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
    const full = path.join(backupDir, filename);
    const encrypted = encryptBackupJson(JSON.stringify(payload));
    await writeFile(full, encrypted);

    const record = await prisma.backupRecord.create({
      data: {
        filename,
        path: full,
        sizeBytes: encrypted.byteLength,
        notes: "Encrypted AES-256-GCM backup (super-admin only)",
      },
    });

    await writeAudit({
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
    return jsonError(
      e instanceof Error ? e.message : "Backup failed",
      500
    );
  }
}
