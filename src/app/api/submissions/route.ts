import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  canModerateSubmissions,
  canPublish,
  submissionTenantWhere,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@/lib/policy";
import { submissionSchema, locationCreateSchema } from "@/lib/validation";
import { clientIp, readJsonLimited, verifyCaptcha } from "@/lib/security";
import { log } from "@/lib/logger";
import { applyApprovedSubmission } from "@/lib/submission-apply";
import { invalidatePublicCaches } from "@/lib/server-memo";

function payloadHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
}

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canModerateSubmissions(auth.user)) return jsonError("Forbidden", 403);

  const where = submissionTenantWhere(auth.user);
  const rows = await prisma.submission.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Provincial: hide submitter PII for other use — only show for scoped province rows
  return jsonOk({
    submissions: rows.map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      submitterName: s.submitterName,
      submitterEmail: s.submitterEmail,
      notes: s.notes,
      reviewedNotes: s.reviewedNotes,
      provinceId: s.provinceId,
      organisationId: s.organisationId,
      createdLocationId: s.createdLocationId,
      createdEntityType: s.createdEntityType,
      createdEntityId: s.createdEntityId,
      reviewedById: s.reviewedById,
      reviewedAt: s.reviewedAt,
      createdAt: s.createdAt,
      payload: s.payloadJson,
    })),
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "submission", { limit: 8, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);

  const bodyResult = submissionSchema.safeParse(parsed.data);
  if (!bodyResult.success) {
    return jsonError("Validation failed", 400, { issues: bodyResult.error.issues });
  }
  const body = bodyResult.data;

  if (process.env.POPIA_CONSENT_REQUIRED === "1" && body.consent !== true) {
    return jsonError("Consent required", 400);
  }

  const captcha = await verifyCaptcha({
    token: body.captchaToken,
    honeypot: body.website,
    remoteIp: clientIp(req),
  });
  if (!captcha.ok) return jsonError(captcha.error, 400);

  // Structured location payload validation when type=location
  let provinceId: string | null = body.provinceId || null;
  if (body.type === "location" || !body.type) {
    if (body.payload.latitude == null || body.payload.longitude == null || !(body.payload.name || body.payload.title)) {
      return jsonError("Location submissions require name, summary, latitude and longitude", 400);
    }
    const locPayload = locationCreateSchema.safeParse({
      ...body.payload,
      name: body.payload.name || body.payload.title,
      summary: body.payload.summary,
      latitude: body.payload.latitude,
      longitude: body.payload.longitude,
    });
    if (!locPayload.success) {
      return jsonError("Location payload invalid", 400, { issues: locPayload.error.issues });
    }
  }

  if (!provinceId && body.payload.provinceSlug) {
    const p = await prisma.province.findFirst({
      where: {
        OR: [
          { slug: String(body.payload.provinceSlug) },
          { code: String(body.payload.provinceSlug) },
        ],
      },
    });
    provinceId = p?.id || null;
  }
  if (!provinceId) {
    const nc = await prisma.province.findFirst({ where: { code: "NC" } });
    provinceId = nc?.id || null;
  }
  if (!provinceId) return jsonError("Could not resolve province for submission", 400);

  const hash = payloadHash(body.payload);
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const dup = await prisma.submission.findFirst({
    where: {
      payloadHash: hash,
      submitterEmail: body.submitterEmail.toLowerCase(),
      createdAt: { gte: since },
      status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
    },
  });
  if (dup) {
    return jsonError("Duplicate submission already received", 409, { id: dup.id });
  }

  const created = await prisma.submission.create({
    data: {
      type: body.type || "location",
      payloadJson: body.payload,
      payloadHash: hash,
      submitterName: body.submitterName,
      submitterEmail: body.submitterEmail.toLowerCase(),
      notes: body.notes || null,
      status: "SUBMITTED",
      provinceId,
      organisationId: body.organisationId || null,
    },
  });

  await writeAudit({
    action: "SUBMISSION",
    entityType: "Submission",
    entityId: created.id,
    metadata: { type: created.type },
    ipAddress: clientIp(req),
    provinceId,
  });

  log.info("submission.created", { id: created.id });
  return jsonOk({ id: created.id, status: created.status }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canModerateSubmissions(auth.user) || !canPublish(auth.user)) {
    return jsonError("Forbidden", 403);
  }

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    id?: string;
    status?: string;
    reviewedNotes?: string;
  };
  if (!body.id || !body.status) return jsonError("id and status required");
  if (!SUBMISSION_STATUSES.includes(body.status as SubmissionStatus)) {
    return jsonError("Invalid status", 400);
  }

  const existing = await prisma.submission.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("Not found", 404);

  const scope = submissionTenantWhere(auth.user);
  if (scope.provinceId && existing.provinceId !== scope.provinceId) {
    return jsonError("Outside your province scope", 403);
  }
  if (!existing.provinceId && scope.provinceId) {
    return jsonError("Submission has no province — cannot moderate until assigned", 403);
  }

  // Idempotent approval
  if (body.status === "APPROVED" && (existing.createdLocationId || existing.createdEntityId)) {
    return jsonOk({
      submission: existing,
      alreadyApproved: true,
      locationId: existing.createdLocationId,
      entityId: existing.createdEntityId,
    });
  }
  if (body.status === "APPROVED" && existing.status === "APPROVED") {
    return jsonError("Submission already approved", 409);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let createdLocationId = existing.createdLocationId;
      let createdEntityType = existing.createdEntityType;
      let createdEntityId = existing.createdEntityId;

      if (body.status === "APPROVED") {
        const applied = await applyApprovedSubmission(tx, existing, auth.user.id);
        createdLocationId = applied.createdLocationId;
        createdEntityType = applied.createdEntityType;
        createdEntityId = applied.createdEntityId;
        if (scope.provinceId && existing.provinceId && existing.provinceId !== scope.provinceId) {
          throw new Error("PROVINCE_MISMATCH");
        }
      }

      const updated = await tx.submission.update({
        where: { id: existing.id },
        data: {
          status: body.status as SubmissionStatus,
          reviewedNotes: body.reviewedNotes || null,
          reviewedById: auth.user.id,
          reviewedAt: new Date(),
          createdLocationId,
          createdEntityType,
          createdEntityId,
        },
      });
      return updated;
    });

    await writeAudit({
      user: auth.user,
      userId: auth.user.id,
      action: body.status!,
      entityType: "Submission",
      entityId: result.id,
      provinceId: result.provinceId,
      ipAddress: clientIp(req),
      metadata: { createdLocationId: result.createdLocationId, createdEntityId: result.createdEntityId },
    });
    invalidatePublicCaches();
    return jsonOk({ submission: result });
  } catch (e) {
    if (e instanceof Error && e.message === "PROVINCE_MISMATCH") {
      return jsonError("Cannot approve a submission for another province", 403);
    }
    if (e instanceof Error && (e.message === "CATEGORY_OR_PROVINCE" || e.message === "LOCATION_PAYLOAD" || e.message === "ECOSYSTEM_PAYLOAD" || e.message === "ORG_PAYLOAD")) {
      return jsonError("Missing fields for approval", 400);
    }
    log.error("submission.moderate.failed", {
      detail: e instanceof Error ? e.message : String(e),
    });
    return jsonError("Moderation failed", 500);
  }
}
