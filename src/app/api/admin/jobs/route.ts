import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { pruneAnalytics, pruneAuditLogs, writeAudit } from "@/lib/audit";
import { canManageBackups, canPublish } from "@/lib/policy";
import { log } from "@/lib/logger";

/**
 * Maintenance jobs: verification expiry flags, retention pruning.
 * Auth: CRON_SECRET header OR super/provincial admin session.
 */
async function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret && header === secret) return { ok: true as const, userId: null };
  const auth = await requireSession();
  if (auth.error) return { ok: false as const, error: auth.error };
  if (!canPublish(auth.user) && !canManageBackups(auth.user)) {
    return { ok: false as const, error: jsonError("Forbidden", 403) };
  }
  return { ok: true as const, userId: auth.user.id, user: auth.user };
}

export async function POST(req: NextRequest) {
  const authz = await authorize(req);
  if (!authz.ok) return authz.error;

  const job = req.nextUrl.searchParams.get("job") || "all";
  const results: Record<string, unknown> = {};

  try {
    if (job === "expiry" || job === "all") {
      // Flag expired verifications: demote PUBLISHED with expired review to VERIFIED + note when ENFORCE_EXPIRY_DOWNGRADE=1
      const expired = await prisma.location.findMany({
        where: {
          status: { in: ["PUBLISHED", "VERIFIED"] },
          verificationExpiresAt: { lt: new Date() },
        },
        select: { id: true, name: true, status: true, provinceId: true },
        take: 500,
      });

      let demoted = 0;
      if (process.env.ENFORCE_EXPIRY_DOWNGRADE === "1") {
        for (const loc of expired) {
          if (loc.status === "PUBLISHED") {
            await prisma.location.update({
              where: { id: loc.id },
              data: {
                status: "VERIFIED",
                verificationNotes: "Auto-flagged: verification expired — re-review required before publish.",
              },
            });
            demoted += 1;
          }
        }
      }
      results.expiry = { found: expired.length, demoted, sample: expired.slice(0, 10) };
    }

    if (job === "prune" || job === "all") {
      const analyticsDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 90);
      const auditDays = Number(process.env.AUDIT_RETENTION_DAYS || 365);
      const a = await pruneAnalytics(analyticsDays);
      const b = await pruneAuditLogs(auditDays);
      results.prune = {
        analyticsDeleted: a.count,
        auditArchivePending: b.count,
        auditArchiveRequired: b.archiveRequired,
        analyticsDays,
        auditDays,
      };
    }

    if (job === "pending-mfa" || job === "all") {
      // Report elevated users without MFA when MFA_ENFORCE=1
      if (process.env.MFA_ENFORCE === "1") {
        const missing = await prisma.user.count({
          where: {
            active: true,
            mfaEnabled: false,
            role: { in: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
          },
        });
        results.mfaGap = { elevatedWithoutMfa: missing };
      }
    }

    await writeAudit({
      userId: authz.userId,
      action: "CRON",
      entityType: "System",
      metadata: { job, results },
    });

    log.info("cron.ran", { job, results });
    return jsonOk({ ok: true, job, results });
  } catch (e) {
    log.error("cron.failed", { detail: e instanceof Error ? e.message : String(e) });
    return jsonError("Job failed", 500);
  }
}

export async function GET(req: NextRequest) {
  // Health-style summary for monitors
  const authz = await authorize(req);
  if (!authz.ok) return authz.error;

  const [expired, openDsar, openSubmissions] = await Promise.all([
    prisma.location.count({
      where: {
        status: { in: ["PUBLISHED", "VERIFIED"] },
        verificationExpiresAt: { lt: new Date() },
      },
    }),
    prisma.dataSubjectRequest.count({ where: { status: "OPEN" } }),
    prisma.submission.count({ where: { status: "SUBMITTED" } }),
  ]);

  return jsonOk({
    expiredVerifications: expired,
    openDsar,
    openSubmissions,
    time: new Date().toISOString(),
  });
}
