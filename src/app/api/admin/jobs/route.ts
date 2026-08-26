import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { pruneAnalytics, pruneAuditLogs, writeAudit } from "@/lib/audit";
import { tenantWhere } from "@/lib/policy";
import { log } from "@/lib/logger";
import { enqueueJob, JOB_TYPES, listDeadLetters, requeueDeadLetter, requeueDeadLetters } from "@/lib/jobs";
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
      ingest: "data.ingest",
      reverify: "data.reverify",
    };
    if (queued[job]) {
      if (job === "import") {
        const batchId = req.nextUrl.searchParams.get("batchId");
        if (!batchId) return jsonError("batchId is required to queue an import job", 400);
        const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { id: true, provinceId: true, status: true } });
        if (!batch) return jsonError("Import batch not found", 404);
        if (authz.provinceId && batch.provinceId && batch.provinceId !== authz.provinceId) {
          return jsonError("Forbidden", 403);
        }
        const row = await enqueueJob(
          "data.import",
          { triggeredBy: authz.userId, provinceId: authz.provinceId || batch.provinceId || null, batchId: batch.id },
          { idempotencyKey: `data.import-${batch.id}` }
        );
        results.queued = { type: "data.import", id: row?.id, batchId: batch.id };
      } else {
        const row = await enqueueJob(
          queued[job],
          { triggeredBy: authz.userId, provinceId: authz.provinceId || null },
          { idempotencyKey: `${queued[job]}-${authz.provinceId || "global"}-${new Date().toISOString().slice(0, 13)}` }
        );
        results.queued = { type: queued[job], id: row?.id };
      }
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

      const expiredOrgs = await prisma.organisation.findMany({
        where: {
          status: { in: ["PUBLISHED", "VERIFIED"] },
          verificationExpiresAt: { lt: new Date() },
          ...(authz.provinceId ? { provinceId: authz.provinceId } : {}),
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
        for (const org of expiredOrgs) {
          if (org.status === "PUBLISHED") {
            await prisma.organisation.update({
              where: { id: org.id },
              data: { status: "VERIFIED", verified: false },
            });
            demoted += 1;
          }
        }
      }
      results.expiry = {
        found: expired.length,
        organisations: expiredOrgs.length,
        demoted,
        sample: expired.slice(0, 10),
      };
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

    if (job === "requeue") {
      const id = req.nextUrl.searchParams.get("id");
      const type = req.nextUrl.searchParams.get("type") || undefined;
      if (id) {
        const row = await requeueDeadLetter(id);
        results.requeued = { id: row.id, type: row.type };
      } else {
        results.requeued = { count: await requeueDeadLetters(type) };
      }
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

  const [expired, expiredOrgs, openDsar, openSubmissions, deadLetters] = await Promise.all([
    prisma.location.count({
      where: {
        ...scope,
        status: { in: ["PUBLISHED", "VERIFIED"] },
        verificationExpiresAt: { lt: new Date() },
      },
    }),
    prisma.organisation.count({
      where: {
        status: { in: ["PUBLISHED", "VERIFIED"] },
        verificationExpiresAt: { lt: new Date() },
        ...(authz.provinceId ? { provinceId: authz.provinceId } : {}),
      },
    }),
    prisma.dataSubjectRequest.count({
      where: { status: "OPEN", ...(authz.provinceId ? { provinceId: authz.provinceId } : {}) },
    }),
    prisma.submission.count({
      where: { status: "SUBMITTED", ...(authz.provinceId ? { provinceId: authz.provinceId } : {}) },
    }),
    authz.provinceId ? Promise.resolve([]) : listDeadLetters(50),
  ]);

  return jsonOk({
    expiredVerifications: expired,
    expiredOrganisationVerifications: expiredOrgs,
    openDsar,
    openSubmissions,
    deadLetters,
    time: new Date().toISOString(),
  });
}
