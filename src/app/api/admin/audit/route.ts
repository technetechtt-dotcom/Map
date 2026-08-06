import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import { auditTenantWhere, canModerateSubmissions, isSuperAdmin } from "@/lib/policy";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canModerateSubmissions(auth.user)) return jsonError("Forbidden", 403);

  const where = auditTenantWhere(auth.user);
  const logs = await prisma.auditLog.findMany({
    where,
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return jsonOk({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      provinceId: l.provinceId,
      organisationId: l.organisationId,
      createdAt: l.createdAt,
      ipAddress: isSuperAdmin(auth.user) ? l.ipAddress : null,
      user: l.user
        ? {
            name: l.user.name,
            email: isSuperAdmin(auth.user) ? l.user.email : undefined,
          }
        : null,
    })),
    retentionNote:
      "Audit logs are append-only in app code. Configure DB triggers to block UPDATE/DELETE in production.",
  });
}
