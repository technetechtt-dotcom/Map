import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { pruneAnalytics, pruneAuditLogs, writeAudit } from "@/lib/audit";
import { tenantWhere } from "@/lib/policy";
import { log } from "@/lib/logger";
import { enqueueJob, JOB_TYPES } from "@/lib/jobs";
import { authorizeCronSecret, authorizeJobRole } from "@/lib/ops-auth";

/**
 * Maintenance jobs. Auth: CRON_SECRET (global) OR exact role.
 * Super admin: all jobs. Provincial admin: tenant-scoped jobs only.
 */
async function authorize(req: NextRequest, job: string) {
  const cron = authorizeCronSecret(req);
  if (cron.ok) return { ok: true as const, userId: null as string | null, user: null, provinceId: undefined as string | undefined, via: "cron" as const };
  const auth = await requireSession();
  if (auth.error) return { ok: false as const, error: auth.error };
  const role = authorizeJobRole(auth.user, job);
  if (!role.ok) return { ok: false as const, error: jsonError(role.reason, 403) };
  return { ok: true as const, userId: auth.user.id, user: auth.user, provinceId: role.provinceId, via: "session" as const };
}

export async function POST(req: NextRequest) {
  const job = req.nextUrl.searchParams.get("job") || "all";
  const authz = await authorize(req, job);
  if (!authz.ok) return authz.error;

  const results: Record<string, unknown> = {};
  const scope = authz.user ? tenantWhere(authz.user) : {};

  try {
    const queued: Record<string, string> = {
      import: "data.import",
      duplicates: "data.duplicates",
      geocode: "data.geocode",
      backup: "system.backup",
      analytics: "analytics.aggregate",
      cleanup: "data.cleanup",
      report: "system.report",
      notify: "notify.deliver",
      expiry: "data.expiry",
    };
    if (queued[job]) {
      const row = await enqueueJob(
        queued[job],
        { triggeredBy: authz.userId, provinceId: authz.provinceId || null },
        { idempotencyKey: `${queued[job]}-${authz.provinceId || "global"}-${new Date().toISOString().slice(0, 13)}` }
      );
      results.queued = { type: queued[job], id: row?.id };
    }
    if (job === "queue") {
      return jsonOk({ types: JOB_TYPES, queued: results.queued });
    }
    if (job === "expiry" || job === "all") {
      const expired = await prisma.location.findMany({
        where: {
          ...scope,
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
      if (process.env.MFA_ENFORCE === "1") {
        const missing = await prisma.user.count({
          where: {
            active: true,
            mfaEnabled: false,
            role: { in: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
            ...(authz.provinceId ? { provinceId: authz.provinceId } : {}),
          },
        });
        results.mfaGap = { elevatedWithoutMfa: missing };
      }
    }

    await writeAudit({
      userId: authz.userId,
      action: "CRON",
      entityType: "System",
      metadata: { job, results, via: authz.via, provinceId: authz.provinceId || null },
    });

    log.info("cron.ran", { job, results });
    return jsonOk({ ok: true, job, results });
  } catch (e) {
    log.error("cron.failed", { detail: e instanceof Error ? e.message : String(e) });
    return jsonError("Job failed", 500);
  }
}

export async function GET(req: NextRequest) {
  const authz = await authorize(req, "queue");
  if (!authz.ok) return authz.error;
  const scope = authz.user ? tenantWhere(authz.user) : {};

  const [expired, openDsar, openSubmissions] = await Promise.all([
    prisma.location.count({
      where: {
        ...scope,
        status: { in: ["PUBLISHED", "VERIFIED"] },
        verificationExpiresAt: { lt: new Date() },
      },
    }),
    prisma.dataSubjectRequest.count({
      where: { status: "OPEN", ...(authz.provinceId ? { provinceId: authz.provinceId } : {}) },
    }),
    prisma.submission.count({
      where: { status: "SUBMITTED", ...(authz.provinceId ? { provinceId: authz.provinceId } : {}) },
    }),
  ]);

  return jsonOk({
    expiredVerifications: expired,
    openDsar,
    openSubmissions,
    time: new Date().toISOString(),
  });
}
