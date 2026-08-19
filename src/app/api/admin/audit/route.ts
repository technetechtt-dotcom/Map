import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import { auditTenantWhere, canModerateSubmissions, isSuperAdmin } from "@/lib/policy";
import { writeAudit } from "@/lib/audit";
import { clientIp } from "@/lib/security";

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canModerateSubmissions(auth.user)) return jsonError("Forbidden", 403);

  const format = req.nextUrl.searchParams.get("format") || "json";
  if (format === "csv" && !isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const take = format === "csv" ? 5000 : 200;
  const logs = await prisma.auditLog.findMany({
    where: auditTenantWhere(auth.user),
    take,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });

  await writeAudit({
    user: auth.user,
    action: format === "csv" ? "AUDIT_EXPORT" : "AUDIT_READ",
    entityType: "AuditLog",
    metadata: { count: logs.length, format },
    ipAddress: clientIp(req),
  });

  if (format === "csv") {
    const header = ["id", "createdAt", "action", "entityType", "entityId", "userId", "actorEmail", "ipAddress", "provinceId", "organisationId"];
    const lines = [header.map(csvCell).join(",")];
    for (const row of logs) {
      lines.push([
        row.id, row.createdAt.toISOString(), row.action, row.entityType, row.entityId,
        row.userId, row.user?.email, row.ipAddress, row.provinceId, row.organisationId,
      ].map(csvCell).join(","));
    }
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return jsonOk({
    logs: logs.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      provinceId: row.provinceId,
      organisationId: row.organisationId,
      createdAt: row.createdAt,
      ipAddress: isSuperAdmin(auth.user) ? row.ipAddress : null,
      user: row.user
        ? { name: row.user.name, email: isSuperAdmin(auth.user) ? row.user.email : undefined }
        : null,
    })),
    retentionNote: "Append-only audit records are exported to encrypted archival storage before database lifecycle retention.",
  });
}
