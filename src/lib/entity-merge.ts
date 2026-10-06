/**
 * Entity Resolution & Duplicate Merging Domain Service.
 * Provides transactional merge, preflight conflict detection, before/after preview,
 * rollback capability, and selective entity split workflows.
 */

import type { RecordStatus, Prisma } from "@prisma/client";
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

export function parseEvidenceArray(value?: unknown): Record<string, unknown>[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : [];
    } catch {
      return [];
    }
  }
  return [];
}

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

  // Structural hard errors (e.g. PROVINCE_MISMATCH, cross-tenant boundary violations)
  // are non-overridable even when force: true is provided.
  const blockingErrors = preview.conflicts.filter((c) => c.severity === "error");
  if (blockingErrors.length > 0) {
    const errorMessages = blockingErrors.map((c) => c.message).join("; ");
    return {
      ok: false as const,
      error: `Merge blocked by non-overridable structural errors: ${errorMessages}`,
      status: 400,
    };
  }

  // Warnings (e.g. distinct canonical keys, distinct organisation assignments, or connector collisions)
  // require explicit force: true confirmation to proceed.
  const warnings = preview.conflicts.filter((c) => c.severity === "warning");
  if (warnings.length > 0 && !options?.force) {
    const warningMessages = warnings.map((c) => c.message).join("; ");
    return {
      ok: false as const,
      error: `Merge requires explicit confirmation to override warnings: ${warningMessages}`,
      status: 400,
    };
  }

  const { source, target } = preview;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Move SourceRecords (recording IDs for rollback)
    const sourceRecordsToMove = await tx.sourceRecord.findMany({
      where: { locationId: source.id },
      select: { id: true },
    });
    const movedSourceRecordIds = sourceRecordsToMove.map((s) => s.id);
    if (movedSourceRecordIds.length > 0) {
      await tx.sourceRecord.updateMany({
        where: { id: { in: movedSourceRecordIds } },
        data: { locationId: target.id },
      });
    }

    // 2. Move IngestionChanges (recording IDs for rollback)
    const changesToMove = await tx.ingestionChange.findMany({
      where: { locationId: source.id },
      select: { id: true },
    });
    const movedIngestionChangeIds = changesToMove.map((c) => c.id);
    if (movedIngestionChangeIds.length > 0) {
      await tx.ingestionChange.updateMany({
        where: { id: { in: movedIngestionChangeIds } },
        data: { locationId: target.id },
      });
    }

    // 3. Resolve ExternalIdentities
    const [sourceIdentities, targetIdentities] = await Promise.all([
      tx.externalIdentity.findMany({ where: { entityType: "location", entityId: source.id } }),
      tx.externalIdentity.findMany({ where: { entityType: "location", entityId: target.id } }),
    ]);

    const movedExternalIdentityIds: string[] = [];
    const deletedExternalIdentities: Array<{ connector: string; externalId: string }> = [];
    for (const srcIdent of sourceIdentities) {
      const existingInTarget = targetIdentities.find(
        (t) => t.connector === srcIdent.connector && t.externalId === srcIdent.externalId
      );
      if (existingInTarget) {
        deletedExternalIdentities.push({
          connector: srcIdent.connector,
          externalId: srcIdent.externalId,
        });
        await tx.externalIdentity.delete({ where: { id: srcIdent.id } });
      } else {
        await tx.externalIdentity.update({
          where: { id: srcIdent.id },
          data: { entityId: target.id },
        });
        movedExternalIdentityIds.push(srcIdent.id);
      }
    }

    // 4. Resolve Translations
    const [sourceTranslations, targetTranslations] = await Promise.all([
      tx.translation.findMany({ where: { entityType: "location", entityId: source.id } }),
      tx.translation.findMany({ where: { entityType: "location", entityId: target.id } }),
    ]);

    const movedTranslationIds: string[] = [];
    const deletedTranslations: Array<{ locale: string; field: string; value: string }> = [];
    for (const srcTrans of sourceTranslations) {
      const existsInTarget = targetTranslations.some(
        (t) => t.field === srcTrans.field && t.locale === srcTrans.locale
      );
      if (existsInTarget) {
        deletedTranslations.push({
          locale: srcTrans.locale,
          field: srcTrans.field,
          value: srcTrans.value,
        });
        await tx.translation.delete({ where: { id: srcTrans.id } });
      } else {
        await tx.translation.update({
          where: { id: srcTrans.id },
          data: { entityId: target.id },
        });
        movedTranslationIds.push(srcTrans.id);
      }
    }

    // 5. Resolve CorrectionRequest references
    const correctionsToMove = await tx.correctionRequest.findMany({
      where: { targetId: source.id, targetType: "location" },
      select: { id: true },
    });
    const movedCorrectionRequestIds = correctionsToMove.map((c) => c.id);
    if (movedCorrectionRequestIds.length > 0) {
      await tx.correctionRequest.updateMany({
        where: { id: { in: movedCorrectionRequestIds } },
        data: { targetId: target.id, targetSlug: target.slug },
      });
    }

    // 6. Resolve NationalEntity linkages
    const nationalEntitiesToMove = await tx.nationalEntity.findMany({
      where: { linkedEntityId: source.id, linkedEntityType: "location" },
      select: { id: true },
    });
    const movedNationalEntityIds = nationalEntitiesToMove.map((n) => n.id);
    if (movedNationalEntityIds.length > 0) {
      await tx.nationalEntity.updateMany({
        where: { id: { in: movedNationalEntityIds } },
        data: { linkedEntityId: target.id },
      });
    }

    // 7. Analytics provenance:
    // Historical AnalyticsEvents remain immutable and completely untouched to prevent OLTP lock escalation.
    // Downstream analytics reporting and dashboard aggregation resolve location aliases and redirects
    // dynamically via EntityReviewAction provenance and Location evidenceJson records.

    // Fetch full source and target inside transaction
    const fullSource = await tx.location.findUnique({ where: { id: source.id } });
    const fullTarget = await tx.location.findUnique({ where: { id: target.id } });
    if (!fullSource || !fullTarget) {
      throw new Error("Source or target location not found in transaction");
    }

    // 8. Archive source entity and attach merge alias/redirect metadata - PRESERVE EVIDENCE
    const sourceEvidence = parseEvidenceArray(fullSource.evidenceJson);
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
        ] as Prisma.InputJsonValue,
      },
    });

    // 9. Backfill missing details on target from source and preserve target evidence
    const backfillData: Record<string, unknown> = {};
    const targetOriginalFields: Record<string, unknown> = {};
    if (!fullTarget.website && fullSource.website) {
      backfillData.website = fullSource.website;
      targetOriginalFields.website = fullTarget.website;
    }
    if (!fullTarget.email && fullSource.email) {
      backfillData.email = fullSource.email;
      targetOriginalFields.email = fullTarget.email;
    }
    if (!fullTarget.phone && fullSource.phone) {
      backfillData.phone = fullSource.phone;
      targetOriginalFields.phone = fullTarget.phone;
    }
    if (!fullTarget.description && fullSource.description) {
      backfillData.description = fullSource.description;
      targetOriginalFields.description = fullTarget.description;
    }
    if (!fullTarget.nameAf && fullSource.nameAf) {
      backfillData.nameAf = fullSource.nameAf;
      targetOriginalFields.nameAf = fullTarget.nameAf;
    }
    if (!fullTarget.summaryAf && fullSource.summaryAf) {
      backfillData.summaryAf = fullSource.summaryAf;
      targetOriginalFields.summaryAf = fullTarget.summaryAf;
    }
    const targetEvidence = parseEvidenceArray(fullTarget.evidenceJson);
    await tx.location.update({
      where: { id: target.id },
      data: {
        ...backfillData,
        evidenceJson: [
          ...targetEvidence,
          {
            type: "MERGED_FROM",
            sourceId: source.id,
            sourceSlug: source.slug,
            mergedAt: new Date().toISOString(),
            mergedBy: actor.id,
          },
        ] as Prisma.InputJsonValue,
      },
    });

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
          targetOriginalFields,
        } as Prisma.InputJsonValue,
        afterJson: {
          targetSlug: target.slug,
          sourceStatus: "ARCHIVED",
          movedSourceRecordIds,
          movedIngestionChangeIds,
          movedExternalIdentityIds,
          deletedExternalIdentities,
          movedTranslationIds,
          deletedTranslations,
          movedCorrectionRequestIds,
          movedNationalEntityIds,
          backfilledFields: Object.keys(backfillData),
          moved: {
            sources: movedSourceRecordIds.length,
            changes: movedIngestionChangeIds.length,
            externalIdentities: movedExternalIdentityIds.length,
            translations: movedTranslationIds.length,
            corrections: movedCorrectionRequestIds.length,
            nationalEntities: movedNationalEntityIds.length,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return {
      reviewAction,
      moved: {
        sources: movedSourceRecordIds.length,
        changes: movedIngestionChangeIds.length,
        externalIdentities: movedExternalIdentityIds.length,
        translations: movedTranslationIds.length,
        corrections: movedCorrectionRequestIds.length,
        nationalEntities: movedNationalEntityIds.length,
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
  coordQuality?: string;
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

  const targetProvinceId = params.provinceId || source.provinceId;

  if (!isSuperAdmin(actor)) {
    const sourceAccess = assertProvinceAccess(actor, source.provinceId);
    if (!sourceAccess.ok) return { ok: false as const, error: sourceAccess.reason, status: 403 };

    // Cross-province entity split authorization check
    if (params.provinceId && params.provinceId !== source.provinceId) {
      const targetAccess = assertProvinceAccess(actor, targetProvinceId);
      if (!targetAccess.ok) {
        return {
          ok: false as const,
          error: `Cross-province split rejected: ${targetAccess.reason}`,
          status: 403,
        };
      }
    }
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

  const provinceId = targetProvinceId;
  const categoryId = params.categoryId || source.categoryId;

  // Validate lower-level geography (province -> district -> municipality)
  // When splitting across provincial boundaries or supplying new geography,
  // automatically clear incompatible lower-level geography to prevent cross-province mismatches.
  let resolvedDistrictId: string | null =
    params.districtId !== undefined
      ? params.districtId
      : params.provinceId && params.provinceId !== source.provinceId
      ? null
      : source.districtId;

  if (resolvedDistrictId) {
    const districtRecord = await prisma.district.findUnique({
      where: { id: resolvedDistrictId },
      select: { id: true, provinceId: true },
    });
    if (!districtRecord || districtRecord.provinceId !== targetProvinceId) {
      resolvedDistrictId = null;
    }
  }

  let resolvedMunicipalityId: string | null =
    params.municipalityId !== undefined
      ? params.municipalityId
      : params.provinceId && params.provinceId !== source.provinceId
      ? null
      : source.municipalityId;

  if (resolvedMunicipalityId) {
    const municipalityRecord = await prisma.municipality.findUnique({
      where: { id: resolvedMunicipalityId },
      select: { id: true, districtId: true, district: { select: { provinceId: true } } },
    });
    if (
      !municipalityRecord ||
      municipalityRecord.district?.provinceId !== targetProvinceId ||
      (resolvedDistrictId && municipalityRecord.districtId !== resolvedDistrictId)
    ) {
      resolvedMunicipalityId = null;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the newly split location entity (defaulting to estimated coordinates until verified)
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
        districtId: resolvedDistrictId,
        municipalityId: resolvedMunicipalityId,
        status: "DRAFT",
        coordQuality: params.coordQuality || "estimated",
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
 * Restores all transferred source records, ingestion changes, external identities,
 * translations, correction requests, and national entity links back to the source entity,
 * reverts backfilled target fields, and restores status.
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
  const afterJson = (reviewAction.afterJson || {}) as Record<string, unknown>;
  const restoredStatus = (beforeJson.sourceStatus as string) || "DRAFT";

  const result = await prisma.$transaction(async (tx) => {
    // 1. Restore SourceRecords back to source
    const movedSourceRecordIds = Array.isArray(afterJson.movedSourceRecordIds)
      ? (afterJson.movedSourceRecordIds as string[])
      : [];
    if (movedSourceRecordIds.length > 0) {
      await tx.sourceRecord.updateMany({
        where: { id: { in: movedSourceRecordIds } },
        data: { locationId: source.id },
      });
    }

    // 2. Restore IngestionChanges back to source
    const movedIngestionChangeIds = Array.isArray(afterJson.movedIngestionChangeIds)
      ? (afterJson.movedIngestionChangeIds as string[])
      : [];
    if (movedIngestionChangeIds.length > 0) {
      await tx.ingestionChange.updateMany({
        where: { id: { in: movedIngestionChangeIds } },
        data: { locationId: source.id },
      });
    }

    // 3. Restore ExternalIdentities back to source
    const movedExternalIdentityIds = Array.isArray(afterJson.movedExternalIdentityIds)
      ? (afterJson.movedExternalIdentityIds as string[])
      : [];
    if (movedExternalIdentityIds.length > 0) {
      await tx.externalIdentity.updateMany({
        where: { id: { in: movedExternalIdentityIds } },
        data: { entityId: source.id },
      });
    }
    const deletedExternalIdentities = Array.isArray(afterJson.deletedExternalIdentities)
      ? (afterJson.deletedExternalIdentities as Array<{ connector: string; externalId: string }>)
      : [];
    for (const d of deletedExternalIdentities) {
      await tx.externalIdentity.create({
        data: {
          connector: d.connector,
          externalId: d.externalId,
          entityType: "location",
          entityId: source.id,
        },
      });
    }

    // 4. Restore Translations back to source
    const movedTranslationIds = Array.isArray(afterJson.movedTranslationIds)
      ? (afterJson.movedTranslationIds as string[])
      : [];
    if (movedTranslationIds.length > 0) {
      await tx.translation.updateMany({
        where: { id: { in: movedTranslationIds } },
        data: { entityId: source.id },
      });
    }
    const deletedTranslations = Array.isArray(afterJson.deletedTranslations)
      ? (afterJson.deletedTranslations as Array<{ locale: string; field: string; value: string }>)
      : [];
    for (const d of deletedTranslations) {
      await tx.translation.create({
        data: {
          locale: d.locale,
          field: d.field,
          value: d.value,
          entityType: "location",
          entityId: source.id,
        },
      });
    }

    // 5. Restore CorrectionRequests
    const movedCorrectionRequestIds = Array.isArray(afterJson.movedCorrectionRequestIds)
      ? (afterJson.movedCorrectionRequestIds as string[])
      : [];
    if (movedCorrectionRequestIds.length > 0) {
      await tx.correctionRequest.updateMany({
        where: { id: { in: movedCorrectionRequestIds } },
        data: { targetId: source.id, targetSlug: source.slug },
      });
    }

    // 6. Restore NationalEntities
    const movedNationalEntityIds = Array.isArray(afterJson.movedNationalEntityIds)
      ? (afterJson.movedNationalEntityIds as string[])
      : [];
    if (movedNationalEntityIds.length > 0) {
      await tx.nationalEntity.updateMany({
        where: { id: { in: movedNationalEntityIds } },
        data: { linkedEntityId: source.id },
      });
    }

    // 7. Revert backfilled fields on target
    const targetOriginalFields = (beforeJson.targetOriginalFields || {}) as Record<string, unknown>;
    const backfilledFields = Array.isArray(afterJson.backfilledFields)
      ? (afterJson.backfilledFields as string[])
      : [];
    if (backfilledFields.length > 0) {
      const revertData: Record<string, unknown> = {};
      for (const field of backfilledFields) {
        revertData[field] = targetOriginalFields[field] ?? null;
      }
      await tx.location.update({ where: { id: target.id }, data: revertData });
    }

    // 8. Revert Evidence
    const sourceEvidence = parseEvidenceArray(source.evidenceJson).filter(
      (e) => !(e.type === "MERGED_INTO" && e.targetId === target.id)
    );
    await tx.location.update({
      where: { id: source.id },
      data: {
        status: restoredStatus as RecordStatus,
        staleAt: null,
        verificationNotes: `Restored from merge rollback (action ${reviewAction.id})`,
        evidenceJson: [
          ...sourceEvidence,
          {
            type: "MERGE_ROLLED_BACK",
            rolledBackAt: new Date().toISOString(),
            rolledBackBy: actor.id,
            originalActionId: reviewAction.id,
          },
        ] as Prisma.InputJsonValue,
      },
    });

    const targetEvidence = parseEvidenceArray(target.evidenceJson).filter(
      (e) => !(e.type === "MERGED_FROM" && e.sourceId === source.id)
    );
    await tx.location.update({
      where: { id: target.id },
      data: {
        evidenceJson: [
          ...targetEvidence,
          {
            type: "MERGE_ROLLED_BACK",
            rolledBackAt: new Date().toISOString(),
            rolledBackBy: actor.id,
            originalActionId: reviewAction.id,
          },
        ] as Prisma.InputJsonValue,
      },
    });

    // 9. Record rollback review action
    const rollbackAction = await tx.entityReviewAction.create({
      data: {
        action: "merge-rollback",
        entityType: "location",
        sourceId: source.id,
        targetId: target.id,
        actorId: actor.id,
        notes: `Rolled back merge from action ${reviewAction.id}`,
        beforeJson: { reviewActionId, targetSlug: target.slug } as Prisma.InputJsonValue,
        afterJson: {
          restoredStatus,
          restoredSources: movedSourceRecordIds.length,
          restoredChanges: movedIngestionChangeIds.length,
          restoredExternalIdentities: movedExternalIdentityIds.length + deletedExternalIdentities.length,
          restoredTranslations: movedTranslationIds.length + deletedTranslations.length,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      rollbackAction,
      restoredStatus,
      restoredCounts: {
        sources: movedSourceRecordIds.length,
        changes: movedIngestionChangeIds.length,
        externalIdentities: movedExternalIdentityIds.length + deletedExternalIdentities.length,
        translations: movedTranslationIds.length + deletedTranslations.length,
      },
    };
  });

  invalidatePublicCaches();

  await writeAudit({
    user: actor,
    action: "LOCATION_MERGE_ROLLBACK",
    entityType: "Location",
    entityId: source.id,
    metadata: {
      sourceId: source.id,
      targetId: target.id,
      reviewActionId,
      rollbackReviewActionId: result.rollbackAction.id,
      restoredCounts: result.restoredCounts,
    },
  });

  return { ok: true as const, result };
}
