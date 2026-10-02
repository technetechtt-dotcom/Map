import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { isProvincialAdmin, assertProvinceAccess } from "@/lib/policy";
import { readJsonLimited, clientIp } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { invalidatePublicCaches } from "@/lib/server-memo";
import {
  previewLocationMerge,
  executeLocationMerge,
  executeLocationSplit,
  rollbackLocationMerge,
} from "@/lib/entity-merge";

const schema = z.object({
  action: z.enum(["preview", "merge", "reject-match", "split", "relink", "rollback"]),
  sourceId: z.string().min(1),
  targetId: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
  force: z.boolean().optional(),
  splitParams: z
    .object({
      name: z.string().min(2).max(120),
      slug: z.string().optional(),
      latitude: z.number().min(-35).max(-22),
      longitude: z.number().min(16).max(33),
      summary: z.string().optional(),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      provinceId: z.string().optional(),
      districtId: z.string().nullable().optional(),
      municipalityId: z.string().nullable().optional(),
      sourceRecordIds: z.array(z.string()).optional(),
      externalIdentityIds: z.array(z.string()).optional(),
      translationIds: z.array(z.string()).optional(),
    })
    .optional(),
  rollbackActionId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;

  // Provincial admins must be bound to a valid province
  if (isProvincialAdmin(auth.user) && !auth.user.provinceId) {
    return jsonError("Provincial administrator has no assigned province", 403);
  }

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = schema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const { action, sourceId, targetId, notes, force, splitParams, rollbackActionId } = body.data;

  // 1. Rollback action
  if (action === "rollback") {
    const actionId = rollbackActionId || sourceId;
    const rolledBack = await rollbackLocationMerge(actionId, auth.user);
    if (!rolledBack.ok) return jsonError(rolledBack.error, rolledBack.status);
    return jsonOk({ ok: true, rolledBack: true, status: rolledBack.restoredStatus });
  }

  // 2. Fetch source record & verify province tenancy
  const source = await prisma.location.findUnique({ where: { id: sourceId } });
  if (!source) return jsonError("Location not found", 404);

  if (isProvincialAdmin(auth.user)) {
    const srcAccess = assertProvinceAccess(auth.user, source.provinceId);
    if (!srcAccess.ok) return jsonError(srcAccess.reason, 403);
  }

  // 3. Merge Preview
  if (action === "preview") {
    if (!targetId) return jsonError("targetId required for preview", 400);
    const preview = await previewLocationMerge(sourceId, targetId, auth.user);
    if (!preview.ok) return jsonError(preview.error, preview.status);
    return jsonOk({ preview });
  }

  // 4. Execute Merge
  if (action === "merge") {
    if (!targetId) return jsonError("targetId required for merge", 400);
    if (sourceId === targetId) return jsonError("source and target must differ", 400);

    const target = await prisma.location.findUnique({ where: { id: targetId } });
    if (!target) return jsonError("Target location not found", 404);

    if (isProvincialAdmin(auth.user)) {
      const tgtAccess = assertProvinceAccess(auth.user, target.provinceId);
      if (!tgtAccess.ok) return jsonError(tgtAccess.reason, 403);
    }

    const mergeResult = await executeLocationMerge(sourceId, targetId, auth.user, {
      notes,
      ipAddress: clientIp(req),
      force,
    });
    if (!mergeResult.ok) return jsonError(mergeResult.error, mergeResult.status);
    return jsonOk({ review: mergeResult.result.reviewAction, moved: mergeResult.result.moved });
  }

  // 5. Execute Split
  if (action === "split") {
    if (!splitParams) {
      // Backwards-compatible simple split if no full payload passed
      const splitResult = await prisma.$transaction(async (tx) => {
        await tx.location.update({
          where: { id: source.id },
          data: { canonicalKey: `${source.canonicalKey || source.slug}-split-${Date.now()}` },
        });
        return tx.entityReviewAction.create({
          data: {
            action: "split",
            entityType: "location",
            sourceId: source.id,
            actorId: auth.user.id,
            notes: notes || null,
            beforeJson: { sourceSlug: source.slug },
            afterJson: { action: "split-key-rotated" },
          },
        });
      });
      invalidatePublicCaches();
      await writeAudit({
        user: auth.user,
        action: "LOCATION_SPLIT",
        entityType: "Location",
        entityId: source.id,
        metadata: { sourceId, reviewId: splitResult.id },
        ipAddress: clientIp(req),
      });
      return jsonOk({ review: splitResult });
    }

    const fullSplit = await executeLocationSplit(
      sourceId,
      {
        ...splitParams,
        notes,
        ipAddress: clientIp(req),
      },
      auth.user
    );
    if (!fullSplit.ok) return jsonError(fullSplit.error, fullSplit.status);
    return jsonOk({ newLocation: fullSplit.result.newLocation, review: fullSplit.result.reviewAction });
  }

  // 6. Relink organisation
  if (action === "relink") {
    if (!targetId) return jsonError("targetId required for relink", 400);
    const target = await prisma.location.findUnique({ where: { id: targetId } });
    if (!target) return jsonError("Target location not found", 404);

    if (isProvincialAdmin(auth.user)) {
      const tgtAccess = assertProvinceAccess(auth.user, target.provinceId);
      if (!tgtAccess.ok) return jsonError(tgtAccess.reason, 403);
    }

    const relinkResult = await prisma.$transaction(async (tx) => {
      await tx.location.update({
        where: { id: source.id },
        data: { organisationId: target.organisationId },
      });
      return tx.entityReviewAction.create({
        data: {
          action: "relink",
          entityType: "location",
          sourceId: source.id,
          targetId: target.id,
          actorId: auth.user.id,
          notes: notes || null,
          beforeJson: { organisationId: source.organisationId },
          afterJson: { organisationId: target.organisationId },
        },
      });
    });

    invalidatePublicCaches();
    await writeAudit({
      user: auth.user,
      action: "LOCATION_RELINK",
      entityType: "Location",
      entityId: source.id,
      metadata: { sourceId, targetId, reviewId: relinkResult.id },
      ipAddress: clientIp(req),
    });
    return jsonOk({ review: relinkResult });
  }

  // 7. Reject match
  if (action === "reject-match") {
    const rejectResult = await prisma.entityReviewAction.create({
      data: {
        action: "reject-match",
        entityType: "location",
        sourceId: source.id,
        targetId: targetId || null,
        actorId: auth.user.id,
        notes: notes || null,
        beforeJson: { sourceSlug: source.slug },
        afterJson: { targetId, action: "reject-match" },
      },
    });

    await writeAudit({
      user: auth.user,
      action: "LOCATION_REJECT_MATCH",
      entityType: "Location",
      entityId: source.id,
      metadata: { sourceId, targetId, reviewId: rejectResult.id },
      ipAddress: clientIp(req),
    });
    return jsonOk({ review: rejectResult });
  }

  return jsonError("Unsupported action", 400);
}

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;

  const isProvincial = isProvincialAdmin(auth.user);

  // If a provincial admin has no assigned province, fail closed!
  if (isProvincial && !auth.user.provinceId) {
    return jsonError("Provincial administrator has no assigned province", 403);
  }

  const provinceScope = isProvincial && auth.user.provinceId ? { provinceId: auth.user.provinceId } : {};

  const [duplicates, missing, campaigns, actions] = await Promise.all([
    prisma.location.findMany({
      where: {
        ...provinceScope,
        status: { in: ["DRAFT", "PENDING_REVIEW"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        provinceId: true,
        verificationTier: true,
        missingFromSource: true,
        consecutiveMisses: true,
      },
    }),
    prisma.location.findMany({
      where: {
        ...provinceScope,
        missingFromSource: true,
      },
      take: 50,
      select: {
        id: true,
        slug: true,
        name: true,
        provinceId: true,
        consecutiveMisses: true,
        lastObservedAt: true,
      },
    }),
    prisma.reverificationCampaign.findMany({
      where: isProvincial ? { assignedToId: auth.user.id } : {},
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.entityReviewAction.findMany({
      where: isProvincial ? { actorId: auth.user.id } : {},
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return jsonOk({ duplicates, missing, campaigns, actions });
}
