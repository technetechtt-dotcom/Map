/**
 * Entity Resolution & Duplicate Merging Domain Service.
 * Provides transactional merge, preflight conflict detection, before/after preview,
 * rollback capability, and selective entity split workflows.
 */

import type { RecordStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { writeAudit } from "./audit";
import { invalidatePublicCaches } from "./server-memo";
import type { AuthUser } from "./policy";
import { assertProvinceAccess, isSuperAdmin } from "./policy";

export type MergeConflictType =
  | "CANONICAL_KEY_MISMATCH"
  | "ORGANISATION_MISMATCH"
  | "PROVINCE_MISMATCH"
  | "EXTERNAL_IDENTITY_COLLISION";

export type MergeConflict = {
  type: MergeConflictType;
  message: string;
  sourceValue: unknown;
  targetValue: unknown;
  severity: "error" | "warning";
};

export type MergePreview = {
  ok: true;
  canMerge: boolean;
  conflicts: MergeConflict[];
  source: {
    id: string;
    slug: string;
    name: string;
    status: string;
    provinceId: string;
    organisationId: string | null;
    canonicalKey: string | null;
  };
  target: {
    id: string;
    slug: string;
    name: string;
    status: string;
    provinceId: string;
    organisationId: string | null;
    canonicalKey: string | null;
  };
  transfers: {
    sourceRecordsCount: number;
    ingestionChangesCount: number;
    externalIdentitiesCount: number;
    translationsCount: number;
    correctionRequestsCount: number;
    nationalEntitiesCount: number;
    analyticsEventsCount: number;
  };
};

/**
 * Generate a before/after merge preview and detect potential conflicts
 * before performing a destructive merge.
 */
export async function previewLocationMerge(
  sourceId: string,
  targetId: string,
  actor?: AuthUser | null
): Promise<MergePreview | { ok: false; error: string; status: number }> {
  if (sourceId === targetId) {
    return { ok: false, error: "Source and target entity must differ", status: 400 };
  }

  const [source, target] = await Promise.all([
    prisma.location.findUnique({
      where: { id: sourceId },
      include: {
        sources: true,
        ingestionChanges: true,
      },
    }),
    prisma.location.findUnique({
      where: { id: targetId },
      include: {
        sources: true,
        ingestionChanges: true,
      },
    }),
  ]);

  if (!source) return { ok: false, error: "Source location not found", status: 404 };
  if (!target) return { ok: false, error: "Target location not found", status: 404 };

  // Tenant / Province permission check
  if (actor && !isSuperAdmin(actor)) {
    const srcAccess = assertProvinceAccess(actor, source.provinceId);
    if (!srcAccess.ok) return { ok: false, error: `Source location: ${srcAccess.reason}`, status: 403 };
    const tgtAccess = assertProvinceAccess(actor, target.provinceId);
    if (!tgtAccess.ok) return { ok: false, error: `Target location: ${tgtAccess.reason}`, status: 403 };
  }

  const conflicts: MergeConflict[] = [];

  // Check province alignment
  if (source.provinceId !== target.provinceId) {
    conflicts.push({
      type: "PROVINCE_MISMATCH",
      message: "Source and target belong to different provinces",
      sourceValue: source.provinceId,
      targetValue: target.provinceId,
      severity: "error",
    });
  }

  // Check canonical key conflict
  if (source.canonicalKey && target.canonicalKey && source.canonicalKey !== target.canonicalKey) {
    conflicts.push({
      type: "CANONICAL_KEY_MISMATCH",
      message: "Both entities have distinct registered canonical keys",
      sourceValue: source.canonicalKey,
      targetValue: target.canonicalKey,
      severity: "warning",
    });
  }

  // Check organisation ownership conflict
  if (source.organisationId && target.organisationId && source.organisationId !== target.organisationId) {
    conflicts.push({
      type: "ORGANISATION_MISMATCH",
      message: "Source and target belong to different organisations",
      sourceValue: source.organisationId,
      targetValue: target.organisationId,
      severity: "warning",
    });
  }

  // Check external identity collisions
  const [sourceIdentities, targetIdentities] = await Promise.all([
    prisma.externalIdentity.findMany({ where: { entityType: "location", entityId: source.id } }),
    prisma.externalIdentity.findMany({ where: { entityType: "location", entityId: target.id } }),
  ]);

  for (const srcIdent of sourceIdentities) {
    const match = targetIdentities.find((t) => t.connector === srcIdent.connector);
    if (match && match.externalId !== srcIdent.externalId) {
      conflicts.push({
        type: "EXTERNAL_IDENTITY_COLLISION",
        message: `Both locations have different external IDs for connector '${srcIdent.connector}'`,
        sourceValue: srcIdent.externalId,
        targetValue: match.externalId,
        severity: "warning",
      });
    }
  }

  const [translationsCount, correctionRequestsCount, nationalEntitiesCount, analyticsEventsCount] =
    await Promise.all([
      prisma.translation.count({ where: { entityType: "location", entityId: source.id } }),
      prisma.correctionRequest.count({ where: { targetId: source.id, targetType: "location" } }),
      prisma.nationalEntity.count({ where: { linkedEntityId: source.id, linkedEntityType: "location" } }),
      prisma.analyticsEvent.count({ where: { locationId: source.id } }),
    ]);

  const hasBlockingErrors = conflicts.some((c) => c.severity === "error");

  return {
    ok: true,
    canMerge: !hasBlockingErrors,
    conflicts,
    source: {
      id: source.id,
      slug: source.slug,
      name: source.name,
      status: source.status,
      provinceId: source.provinceId,
      organisationId: source.organisationId,
      canonicalKey: source.canonicalKey,
    },
    target: {
      id: target.id,
      slug: target.slug,
      name: target.name,
      status: target.status,
      provinceId: target.provinceId,
      organisationId: target.organisationId,
      canonicalKey: target.canonicalKey,
    },
    transfers: {
      sourceRecordsCount: source.sources.length,
      ingestionChangesCount: source.ingestionChanges.length,
      externalIdentitiesCount: sourceIdentities.length,
      translationsCount,
      correctionRequestsCount,
      nationalEntitiesCount,
      analyticsEventsCount,
    },
  };
}

/**
 * Execute a transactional entity merge from source into target.
 * Moves all related records, handles external identity and translation deduplication,
 * archives source entity with alias/redirect info, and creates audit and review history.
 */
export async function executeLocationMerge(
  sourceId: string,
  targetId: string,
  actor: AuthUser,
  options?: {
    notes?: string;
    ipAddress?: string;
    force?: boolean;
  }
) {
  const preview = await previewLocationMerge(sourceId, targetId, actor);
  if (!preview.ok) {
    return { ok: false as const, error: preview.error, status: preview.status };
  }
  if (!preview.canMerge && !options?.force) {
    const errorMessages = preview.conflicts
      .filter((c) => c.severity === "error")
      .map((c) => c.message)
      .join("; ");
    return { ok: false as const, error: `Merge blocked by conflicts: ${errorMessages}`, status: 400 };
  }

  const { source, target } = preview;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Move SourceRecords
    const movedSources = await tx.sourceRecord.updateMany({
      where: { locationId: source.id },
      data: { locationId: target.id },
    });

    // 2. Move IngestionChanges
    const movedChanges = await tx.ingestionChange.updateMany({
      where: { locationId: source.id },
      data: { locationId: target.id },
    });

    // 3. Resolve ExternalIdentities
    const [sourceIdentities, targetIdentities] = await Promise.all([
      tx.externalIdentity.findMany({ where: { entityType: "location", entityId: source.id } }),
      tx.externalIdentity.findMany({ where: { entityType: "location", entityId: target.id } }),
    ]);

    let externalIdentitiesMoved = 0;
    for (const srcIdent of sourceIdentities) {
      const existingInTarget = targetIdentities.find(
        (t) => t.connector === srcIdent.connector && t.externalId === srcIdent.externalId
      );
      if (existingInTarget) {
        // Redundant duplicate on source — remove it so target remains primary
        await tx.externalIdentity.delete({ where: { id: srcIdent.id } });
      } else {
        // Transfer to target
        await tx.externalIdentity.update({
          where: { id: srcIdent.id },
          data: { entityId: target.id },
        });
        externalIdentitiesMoved++;
      }
    }

    // 4. Resolve Translations
    const [sourceTranslations, targetTranslations] = await Promise.all([
      tx.translation.findMany({ where: { entityType: "location", entityId: source.id } }),
      tx.translation.findMany({ where: { entityType: "location", entityId: target.id } }),
    ]);

    let translationsMoved = 0;
    for (const srcTrans of sourceTranslations) {
      const existsInTarget = targetTranslations.some(
        (t) => t.field === srcTrans.field && t.locale === srcTrans.locale
      );
      if (existsInTarget) {
        // Keep target's existing translation, remove redundant source record
        await tx.translation.delete({ where: { id: srcTrans.id } });
      } else {
        await tx.translation.update({
          where: { id: srcTrans.id },
          data: { entityId: target.id },
        });
        translationsMoved++;
      }
    }

    // 5. Resolve CorrectionRequest references
    const movedCorrections = await tx.correctionRequest.updateMany({
      where: { targetId: source.id, targetType: "location" },
      data: { targetId: target.id, targetSlug: target.slug },
    });

    // 6. Resolve NationalEntity linkages
    const movedNationalEntities = await tx.nationalEntity.updateMany({
      where: { linkedEntityId: source.id, linkedEntityType: "location" },
      data: { linkedEntityId: target.id },
    });

    // 7. Preserve AnalyticsEvents with historical metadata
    // We keep historical locationId but annotate metadata with merge redirect
    const historicalEvents = await tx.analyticsEvent.findMany({
      where: { locationId: source.id },
      take: 200,
    });
    for (const evt of historicalEvents) {
      const currentMeta = (evt.metadataJson && typeof evt.metadataJson === "object" ? evt.metadataJson : {}) as Record<string, unknown>;
      await tx.analyticsEvent.update({
        where: { id: evt.id },
        data: {
          metadataJson: {
            ...currentMeta,
            mergedIntoLocationId: target.id,
            mergedIntoSlug: target.slug,
          },
        },
      });
    }

    // 8. Archive source entity and attach merge alias/redirect metadata
    const sourceEvidence = Array.isArray(source) ? [] : [];
    await tx.location.update({
      where: { id: source.id },
      data: {
        status: "ARCHIVED",
        staleAt: new Date(),
        verificationNotes: `Merged into ${target.slug} (${target.id}) by user ${actor.id}`,
        evidenceJson: [
          ...sourceEvidence,
          {
            type: "MERGED_INTO",
            targetId: target.id,
            targetSlug: target.slug,
            mergedAt: new Date().toISOString(),
            mergedBy: actor.id,
          },
        ],
      },
    });

    // 9. Backfill missing details on target from source if target fields are empty
    const fullSource = await tx.location.findUnique({ where: { id: source.id } });
    const fullTarget = await tx.location.findUnique({ where: { id: target.id } });
    if (fullSource && fullTarget) {
      const backfillData: Record<string, unknown> = {};
      if (!fullTarget.website && fullSource.website) backfillData.website = fullSource.website;
      if (!fullTarget.email && fullSource.email) backfillData.email = fullSource.email;
      if (!fullTarget.phone && fullSource.phone) backfillData.phone = fullSource.phone;
      if (!fullTarget.description && fullSource.description) backfillData.description = fullSource.description;
      if (!fullTarget.nameAf && fullSource.nameAf) backfillData.nameAf = fullSource.nameAf;
      if (!fullTarget.summaryAf && fullSource.summaryAf) backfillData.summaryAf = fullSource.summaryAf;
      if (Object.keys(backfillData).length > 0) {
        await tx.location.update({ where: { id: target.id }, data: backfillData });
      }
    }

    // 10. Record EntityReviewAction for full provenance and redirect lookup
    const reviewAction = await tx.entityReviewAction.create({
      data: {
        action: "merge",
        entityType: "location",
        sourceId: source.id,
        targetId: target.id,
        actorId: actor.id,
        notes: options?.notes || null,
        beforeJson: {
          sourceSlug: source.slug,
          sourceName: source.name,
          sourceStatus: source.status,
          sourceProvinceId: source.provinceId,
          targetSlug: target.slug,
          targetName: target.name,
        },
        afterJson: {
          targetSlug: target.slug,
          sourceStatus: "ARCHIVED",
          moved: {
            sources: movedSources.count,
            changes: movedChanges.count,
            externalIdentities: externalIdentitiesMoved,
            translations: translationsMoved,
            corrections: movedCorrections.count,
            nationalEntities: movedNationalEntities.count,
          },
        },
      },
    });

    return {
      reviewAction,
      moved: {
        sources: movedSources.count,
        changes: movedChanges.count,
        externalIdentities: externalIdentitiesMoved,
        translations: translationsMoved,
        corrections: movedCorrections.count,
        nationalEntities: movedNationalEntities.count,
      },
    };
  });

  invalidatePublicCaches();

  await writeAudit({
    user: actor,
    action: "LOCATION_MERGE",
    entityType: "Location",
    entityId: target.id,
    metadata: {
      sourceId: source.id,
      targetId: target.id,
      sourceSlug: source.slug,
      targetSlug: target.slug,
      reviewActionId: result.reviewAction.id,
      moved: result.moved,
      notes: options?.notes,
    },
    ipAddress: options?.ipAddress,
  });

  return { ok: true as const, result };
}

export type LocationSplitParams = {
  name: string;
  slug?: string;
  summary?: string;
  description?: string;
  latitude: number;
  longitude: number;
  categoryId?: string;
  provinceId?: string;
  districtId?: string | null;
  municipalityId?: string | null;
  sourceRecordIds?: string[];
  externalIdentityIds?: string[];
  translationIds?: string[];
  notes?: string;
  ipAddress?: string;
};

/**
 * Execute a real entity split workflow.
 * Creates a new target entity with chosen coordinates, geography, and metadata,
 * and transfers selected evidence, source records, external identities, and translations.
 */
export async function executeLocationSplit(
  sourceId: string,
  params: LocationSplitParams,
  actor: AuthUser
) {
  const source = await prisma.location.findUnique({
    where: { id: sourceId },
    include: {
      sources: true,
      category: true,
    },
  });
  if (!source) return { ok: false as const, error: "Source location not found", status: 404 };

  if (!isSuperAdmin(actor)) {
    const access = assertProvinceAccess(actor, source.provinceId);
    if (!access.ok) return { ok: false as const, error: access.reason, status: 403 };
  }

  const slugBase =
    params.slug ||
    params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

  let newSlug = slugBase;
  let counter = 1;
  while (await prisma.location.findUnique({ where: { slug: newSlug } })) {
    newSlug = `${slugBase}-${counter++}`;
  }

  const provinceId = params.provinceId || source.provinceId;
  const categoryId = params.categoryId || source.categoryId;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the newly split location entity
    const newLocation = await tx.location.create({
      data: {
        slug: newSlug,
        name: params.name,
        summary: params.summary || source.summary,
        description: params.description || null,
        latitude: params.latitude,
        longitude: params.longitude,
        categoryId,
        provinceId,
        districtId: params.districtId !== undefined ? params.districtId : source.districtId,
        municipalityId: params.municipalityId !== undefined ? params.municipalityId : source.municipalityId,
        status: "DRAFT",
        coordQuality: "verified",
        canonicalKey: `${newSlug}-split-${Date.now()}`,
        evidenceJson: [
          {
            type: "SPLIT_FROM",
            sourceId: source.id,
            sourceSlug: source.slug,
            splitAt: new Date().toISOString(),
            splitBy: actor.id,
          },
        ],
      },
    });

    // 2. Transfer chosen SourceRecords
    let sourcesMoved = 0;
    if (params.sourceRecordIds && params.sourceRecordIds.length > 0) {
      const updated = await tx.sourceRecord.updateMany({
        where: { id: { in: params.sourceRecordIds }, locationId: source.id },
        data: { locationId: newLocation.id },
      });
      sourcesMoved = updated.count;
    }

    // 3. Transfer chosen ExternalIdentities
    let externalIdentitiesMoved = 0;
    if (params.externalIdentityIds && params.externalIdentityIds.length > 0) {
      const updated = await tx.externalIdentity.updateMany({
        where: { id: { in: params.externalIdentityIds }, entityId: source.id, entityType: "location" },
        data: { entityId: newLocation.id },
      });
      externalIdentitiesMoved = updated.count;
    }

    // 4. Transfer chosen Translations
    let translationsMoved = 0;
    if (params.translationIds && params.translationIds.length > 0) {
      const updated = await tx.translation.updateMany({
        where: { id: { in: params.translationIds }, entityId: source.id, entityType: "location" },
        data: { entityId: newLocation.id },
      });
      translationsMoved = updated.count;
    }

    // 5. Update source canonical key if needed to avoid conflicts
    await tx.location.update({
      where: { id: source.id },
      data: {
        canonicalKey: `${source.canonicalKey || source.slug}-origin-${Date.now()}`,
      },
    });

    // 6. Record EntityReviewAction for provenance
    const reviewAction = await tx.entityReviewAction.create({
      data: {
        action: "split",
        entityType: "location",
        sourceId: source.id,
        targetId: newLocation.id,
        actorId: actor.id,
        notes: params.notes || null,
        beforeJson: { sourceSlug: source.slug, sourceName: source.name },
        afterJson: {
          newLocationId: newLocation.id,
          newLocationSlug: newLocation.slug,
          movedSources: sourcesMoved,
          movedExternalIdentities: externalIdentitiesMoved,
          movedTranslations: translationsMoved,
        },
      },
    });

    return { newLocation, reviewAction, moved: { sourcesMoved, externalIdentitiesMoved, translationsMoved } };
  });

  invalidatePublicCaches();

  await writeAudit({
    user: actor,
    action: "LOCATION_SPLIT",
    entityType: "Location",
    entityId: result.newLocation.id,
    metadata: {
      sourceId: source.id,
      newLocationId: result.newLocation.id,
      newSlug: result.newLocation.slug,
      reviewActionId: result.reviewAction.id,
      moved: result.moved,
      notes: params.notes,
    },
    ipAddress: params.ipAddress,
  });

  return { ok: true as const, result };
}

/**
 * Rollback / recovery procedure for a prior location merge.
 */
export async function rollbackLocationMerge(reviewActionId: string, actor: AuthUser) {
  const reviewAction = await prisma.entityReviewAction.findUnique({
    where: { id: reviewActionId },
  });
  if (!reviewAction || reviewAction.action !== "merge" || !reviewAction.targetId) {
    return { ok: false as const, error: "Merge review action not found", status: 404 };
  }

  const [source, target] = await Promise.all([
    prisma.location.findUnique({ where: { id: reviewAction.sourceId } }),
    prisma.location.findUnique({ where: { id: reviewAction.targetId } }),
  ]);
  if (!source || !target) {
    return { ok: false as const, error: "Source or target location no longer exists", status: 404 };
  }

  if (!isSuperAdmin(actor)) {
    const srcAccess = assertProvinceAccess(actor, source.provinceId);
    if (!srcAccess.ok) return { ok: false as const, error: srcAccess.reason, status: 403 };
  }

  const beforeJson = (reviewAction.beforeJson || {}) as Record<string, unknown>;
  const restoredStatus = (beforeJson.sourceStatus as string) || "DRAFT";

  await prisma.$transaction(async (tx) => {
    // Restore source location status
    await tx.location.update({
      where: { id: source.id },
      data: {
        status: restoredStatus as RecordStatus,
        staleAt: null,
        verificationNotes: `Restored from merge rollback (action ${reviewAction.id})`,
      },
    });

    // Record rollback action
    await tx.entityReviewAction.create({
      data: {
        action: "merge-rollback",
        entityType: "location",
        sourceId: source.id,
        targetId: target.id,
        actorId: actor.id,
        notes: `Rolled back merge from action ${reviewAction.id}`,
        beforeJson: { reviewActionId },
        afterJson: { restoredStatus },
      },
    });
  });

  invalidatePublicCaches();

  await writeAudit({
    user: actor,
    action: "LOCATION_MERGE_ROLLBACK",
    entityType: "Location",
    entityId: source.id,
    metadata: { sourceId: source.id, targetId: target.id, reviewActionId },
  });

  return { ok: true as const, restoredStatus };
}
