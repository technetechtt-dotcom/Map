import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;

  const [locations, users, organisations, funding, events, programmes, procurements, submissions, audits, settings] =
    await Promise.all([
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
  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const full = path.join(backupDir, filename);
  const json = JSON.stringify(payload, null, 2);
  await writeFile(full, json, "utf8");

  const record = await prisma.backupRecord.create({
    data: {
      filename,
      path: full,
      sizeBytes: Buffer.byteLength(json),
      notes: "Manual admin backup",
    },
  });

  await writeAudit({
    userId: auth.user.id,
    action: "BACKUP",
    entityType: "System",
    entityId: record.id,
    metadata: { filename, sizeBytes: record.sizeBytes },
  });

  return jsonOk({ backup: record, path: `/api/admin/backups?file=${filename}` });
}

export async function POST() {
  return GET();
}
