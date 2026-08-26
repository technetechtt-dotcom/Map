import { createHash } from "crypto";
import { prisma } from "./prisma";
import { parseLatitude, parseLongitude } from "./coords";
import { canonicalEntityKey, contentFingerprint, snapshotEntity } from "./ingestion/resolve";
import { authorityFor, shouldAcceptField, TRUSTED_FIELDS, type TrustedField } from "./ingestion/authority";
import { deriveVerificationTier, isProtectedVerificationTier } from "./verification";
import { validatePointAssignment } from "./geo-validation";
import { invalidatePublicCaches } from "./server-memo";

export type ImportSourceRow = {
  name?: string;
  summary?: string;
  description?: string;
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
  website?: string;
  email?: string;
  phone?: string;
  categorySlug?: string;
  categoryId?: string;
  provinceSlug?: string;
  provinceId?: string;
  tags?: string[];
  source?: string;
  retrievedAt?: string;
  sourceVersion?: string;
  sourceUrl?: string | null;
  etag?: string | null;
  contentHash?: string;
  externalId?: string;
  confidence?: string;
  licence?: string;
  verificationTier?: string;
};

export type ImportRowState = {
  index: number;
  rowHash: string;
  status: "PENDING" | "APPLIED" | "FAILED" | "SKIPPED";
  locationId?: string;
  slug?: string;
  error?: string;
};

type StagingReportRow = {
  index?: number;
  ok?: boolean;
  issues?: string[];
  status?: ImportRowState["status"];
  rowHash?: string;
  locationId?: string;
  slug?: string;
  error?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function importRowHash(row: ImportSourceRow): string {
  const normalized = {
    name: String(row.name || "").trim().toLowerCase(),
    latitude: parseLatitude(row.latitude),
    longitude: parseLongitude(row.longitude),
    provinceId: row.provinceId || row.provinceSlug || "",
    categoryId: row.categoryId || row.categorySlug || "",
    address: String(row.address || "").trim().toLowerCase(),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function resolveImportRowStates(reportJson: unknown, sourceRows: ImportSourceRow[]): ImportRowState[] {
  const existing =
    reportJson && typeof reportJson === "object" && Array.isArray((reportJson as { rows?: unknown }).rows)
      ? ((reportJson as { rows: StagingReportRow[] }).rows)
      : [];
  const byIndex = new Map(existing.map((row, fallback) => [typeof row.index === "number" ? row.index : fallback, row]));
  return sourceRows.map((row, index) => {
    const prev = byIndex.get(index);
    const rowHash = importRowHash(row);
    if (prev?.status && prev.rowHash === rowHash) {
      return {
        index,
        rowHash,
        status: prev.status,
        locationId: prev.locationId,
        slug: prev.slug,
        error: prev.error,
      };
    }
    if (prev && prev.ok === false) {
      return {
        index,
        rowHash,
        status: "SKIPPED",
        error: (prev.issues || []).join("; ") || "failed staging validation",
      };
    }
    return { index, rowHash, status: "PENDING" as const };
  });
}

type ExistingLocation = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  latitude: number;
  longitude: number;
  address: string | null;
  website: string | null;
  verificationTier: string;
  lastVerifiedAt: Date | null;
  verificationExpiresAt: Date | null;
  coordQuality: string;
  coordSource: string | null;
  canonicalKey?: string | null;
};

export function mergeExistingLocation(
  existing: ExistingLocation,
  incoming: { name: string; summary: string; latitude: number; longitude: number; address?: string | null; website?: string | null },
  provenance: Record<string, unknown>,
  options?: { incomingAuthority?: number; fieldAuthorities?: Partial<Record<TrustedField, number>> }
) {
  const protectedRecord = isProtectedVerificationTier(existing.verificationTier);
  const incomingAuthority = options?.incomingAuthority ?? authorityFor({
    connector: typeof provenance.verificationSource === "string" ? provenance.verificationSource : undefined,
    verificationTier: typeof provenance.verificationTier === "string" ? provenance.verificationTier : undefined,
  });
  const existingFloor = protectedRecord ? 80 : 0;
  const pick = (field: TrustedField, incomingValue: string | null | undefined, existingValue: string | null | undefined) => {
    const held = options?.fieldAuthorities?.[field] ?? existingFloor;
    if (!incomingValue) return existingValue;
    return shouldAcceptField(held, incomingAuthority) ? incomingValue : existingValue;
  };
  return {
    summary: pick("summary", incoming.summary, existing.summary) || existing.summary,
    address: pick("address", incoming.address || null, existing.address) || existing.address,
    website: pick("website", incoming.website || null, existing.website) || existing.website,
    ...provenance,
    canonicalKey: (protectedRecord ? existing.canonicalKey || provenance.canonicalKey : provenance.canonicalKey) as string | undefined,
    ...(protectedRecord
      ? {
          latitude: existing.latitude,
          longitude: existing.longitude,
          name: existing.name,
          verificationTier: existing.verificationTier,
          lastVerifiedAt: existing.lastVerifiedAt,
          verificationExpiresAt: existing.verificationExpiresAt,
          coordQuality: existing.coordQuality,
          coordSource: existing.coordSource,
        }
      : {
          latitude: incoming.latitude,
          longitude: incoming.longitude,
        }),
  };
}

export function canonicalKeyForImport(opts: {
  existing?: { canonicalKey?: string | null; name: string; latitude: number; longitude: number; verificationTier: string } | null;
  name: string;
  provinceSlug: string;
  latitude: number;
  longitude: number;
}) {
  if (opts.existing && isProtectedVerificationTier(opts.existing.verificationTier)) {
    return (
      opts.existing.canonicalKey ||
      canonicalEntityKey({
        name: opts.existing.name,
        provinceSlug: opts.provinceSlug,
        latitude: opts.existing.latitude,
        longitude: opts.existing.longitude,
      })
    );
  }
  return canonicalEntityKey({
    name: opts.name,
    provinceSlug: opts.provinceSlug,
    latitude: opts.latitude,
    longitude: opts.longitude,
  });
}

async function findByConnectorExternalId(connector: string, externalId?: string) {
  if (!externalId) return null;
  const ident = await prisma.externalIdentity.findUnique({
    where: {
      connector_externalId_entityType: {
        connector,
        externalId,
        entityType: "location",
      },
    },
  });
  if (!ident) return null;
  return prisma.location.findUnique({ where: { id: ident.entityId } });
}

async function resolveExistingLocation(opts: {
  connector: string;
  externalId?: string;
  canonicalKey: string;
  slug: string;
}) {
  const byIdentity = await findByConnectorExternalId(opts.connector, opts.externalId);
  if (byIdentity) return byIdentity;
  return (
    (await prisma.location.findUnique({ where: { canonicalKey: opts.canonicalKey } })) ||
    (await prisma.location.findUnique({ where: { slug: opts.slug } }))
  );
}

async function rememberObservation(opts: {
  entityId: string;
  connector: string;
  sourceVersion?: string | null;
  contentHash?: string | null;
  seenAt: Date;
}) {
  await prisma.sourceObservation.upsert({
    where: {
      entityType_entityId_connector: {
        entityType: "location",
        entityId: opts.entityId,
        connector: opts.connector,
      },
    },
    create: {
      entityType: "location",
      entityId: opts.entityId,
      connector: opts.connector,
      lastSeenAt: opts.seenAt,
      consecutiveMisses: 0,
      missingFromSource: false,
      sourceVersion: opts.sourceVersion || null,
      contentHash: opts.contentHash || null,
    },
    update: {
      lastSeenAt: opts.seenAt,
      consecutiveMisses: 0,
      missingFromSource: false,
      sourceVersion: opts.sourceVersion || null,
      contentHash: opts.contentHash || null,
    },
  });
  await prisma.location.update({
    where: { id: opts.entityId },
    data: { lastObservedAt: opts.seenAt, consecutiveMisses: 0, missingFromSource: false },
  });
}

async function persistFieldAuthorities(opts: {
  entityId: string;
  source: string;
  authority: number;
  fields: Partial<Record<TrustedField, string | number | null | undefined>>;
  observedAt: Date;
}) {
  for (const field of TRUSTED_FIELDS) {
    if (opts.fields[field] == null || opts.fields[field] === "") continue;
    const existing = await prisma.fieldAuthority.findUnique({
      where: { entityType_entityId_field: { entityType: "location", entityId: opts.entityId, field } },
    });
    if (existing && existing.authority > opts.authority) continue;
    await prisma.fieldAuthority.upsert({
      where: { entityType_entityId_field: { entityType: "location", entityId: opts.entityId, field } },
      create: {
        entityType: "location",
        entityId: opts.entityId,
        field,
        source: opts.source,
        authority: opts.authority,
        observedAt: opts.observedAt,
      },
      update: { source: opts.source, authority: opts.authority, observedAt: opts.observedAt },
    });
  }
}

const MISS_REVIEW = 3;
const MISS_ARCHIVE = 6;

async function markMissingFromSource(connector: string, seenIds: string[], seenAt: Date) {
  const previous = await prisma.sourceObservation.findMany({
    where: {
      connector,
      entityType: "location",
      ...(seenIds.length ? { entityId: { notIn: seenIds } } : {}),
    },
  });
  for (const obs of previous) {
    const misses = obs.consecutiveMisses + 1;
    await prisma.sourceObservation.update({
      where: { id: obs.id },
      data: { consecutiveMisses: misses, missingFromSource: misses >= MISS_REVIEW },
    });
    const location = await prisma.location.findUnique({ where: { id: obs.entityId } });
    if (!location) continue;
    const protectedRecord = isProtectedVerificationTier(location.verificationTier);
    await prisma.location.update({
      where: { id: location.id },
      data: {
        consecutiveMisses: misses,
        missingFromSource: misses >= MISS_REVIEW,
        ...(misses >= MISS_REVIEW && !protectedRecord && location.status !== "ARCHIVED" ? { status: "PENDING_REVIEW" } : {}),
        ...(misses >= MISS_ARCHIVE && !protectedRecord ? { status: "ARCHIVED", staleAt: seenAt } : {}),
      },
    });
  }
}

async function rememberExternalIdentity(opts: {
  connector: string;
  externalId?: string;
  entityId: string;
}) {
  if (!opts.externalId) return;
  await prisma.externalIdentity.upsert({
    where: {
      connector_externalId_entityType: {
        connector: opts.connector,
        externalId: opts.externalId,
        entityType: "location",
      },
    },
    create: {
      connector: opts.connector,
      externalId: opts.externalId,
      entityType: "location",
      entityId: opts.entityId,
    },
    update: { entityId: opts.entityId },
  });
}

export async function applyImportBatch(
  batchId: string,
  options?: { jobId?: string; ownerId?: string; forceProvinceId?: string | null }
) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("Import batch not found");
  if (batch.status === "REJECTED") return { success: false, applied: batch.appliedCount, idempotent: true, errors: [] as ImportRowState[] };
  if (batch.schemaDrift) return { success: false, applied: 0, idempotent: true, errors: [{ index: 0, rowHash: "", status: "FAILED", error: "schema drift quarantined" }] };
  const rows = Array.isArray(batch.payloadJson) ? (batch.payloadJson as ImportSourceRow[]) : [];
  if (!rows.length) {
    return { success: true, applied: batch.appliedCount, idempotent: true, errors: [] as ImportRowState[] };
  }
  const states = resolveImportRowStates(batch.reportJson, rows);
  if (batch.status === "APPLIED" && states.every((row) => row.status !== "PENDING")) {
    return { success: true, applied: batch.appliedCount, idempotent: true, errors: states.filter((row) => row.status === "FAILED") };
  }

  const defaultCategory = await prisma.category.findFirst();
  let applied = states.filter((row) => row.status === "APPLIED").length;
  const priorReport =
    batch.reportJson && typeof batch.reportJson === "object" ? (batch.reportJson as Record<string, unknown>) : {};
  const previousAppliedAt = batch.appliedAt;
  const priorJobId = typeof priorReport.jobId === "string" ? priorReport.jobId : "";

  async function checkpoint() {
    const pending = states.some((row) => row.status === "PENDING");
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: pending ? "STAGED" : applied > 0 ? "APPLIED" : "REJECTED",
        appliedCount: applied,
        appliedAt: pending ? previousAppliedAt : new Date(),
        reportJson: {
          ...priorReport,
          jobId: options?.jobId || priorJobId,
          cursor: states.find((row) => row.status === "PENDING")?.index ?? rows.length,
          rows: states,
        },
      },
    });
  }

  for (const state of states) {
    if (state.status === "APPLIED" || state.status === "SKIPPED") continue;
    const row = rows[state.index] || {};
    try {
      const name = String(row.name || "").trim();
      if (!name) {
        state.status = "SKIPPED";
        state.error = "name required";
        continue;
      }
      const lat = parseLatitude(row.latitude);
      const lng = parseLongitude(row.longitude);
      if (lat == null || lng == null) throw new Error("invalid coordinates");
      const province = options?.forceProvinceId
        ? await prisma.province.findUnique({ where: { id: options.forceProvinceId } })
        : await prisma.province.findFirst({
            where: {
              OR: [
                { id: String(row.provinceId || batch.provinceId || "") },
                { slug: String(row.provinceSlug || "") },
              ].filter((clause) => Object.values(clause)[0]),
            },
          });
      if (!province) throw new Error("unknown province");
      if (options?.forceProvinceId && province.id !== options.forceProvinceId) {
        throw new Error("row province outside import scope");
      }
      const boundary = validatePointAssignment(lng, lat, province.geojson);
      if (boundary === "invalid") throw new Error("coordinates outside assigned province boundary");
      const category = await prisma.category.findFirst({
        where: {
          OR: [{ id: String(row.categoryId || defaultCategory?.id || "") }, { slug: String(row.categorySlug || "other") }].filter(
            (clause) => Object.values(clause)[0]
          ),
        },
      });
      if (!category) throw new Error("unknown category");
      const slug = `${slugify(name) || "location"}-${state.rowHash.slice(0, 10)}`;
      const connector = String(row.source || batch.source);
      const externalId = row.externalId ? String(row.externalId) : undefined;
      const existingSeed = await findByConnectorExternalId(connector, externalId);
      const canonicalKey = canonicalKeyForImport({
        existing: existingSeed,
        name,
        provinceSlug: province.slug,
        latitude: lat,
        longitude: lng,
      });
      const existing = existingSeed || (await resolveExistingLocation({ connector, canonicalKey, slug }));
      const retrievedAt = row.retrievedAt ? new Date(String(row.retrievedAt)) : new Date();
      const sourceVersion = String(row.sourceVersion || batch.sourceVersion || batch.source);
      const sourceUrl = row.sourceUrl ? String(row.sourceUrl) : batch.sourceUrl;
      const etag = row.etag ? String(row.etag) : null;
      const contentHash = row.contentHash ? String(row.contentHash) : null;
      const confidence = String(row.confidence || batch.licence || "import");
      const verificationTier = deriveVerificationTier({
        verificationTier: row.verificationTier,
        sourceConfidence: confidence,
        lastVerifiedAt: null,
        coordQuality: "directory-only",
      });
      const incomingAuthority = authorityFor({ connector, verificationTier });
      const provenance = {
        retrievedAt,
        sourceVersion,
        sourceUrl,
        sourceConfidence: confidence,
        verificationSource: connector,
        verificationTier,
        coordSource: connector,
        coordQuality: "directory-only" as const,
        canonicalKey,
        externalId: externalId || null,
      };
      const incoming = {
        name,
        summary: String(row.summary || (existing ? existing.summary : name)).slice(0, 500),
        latitude: lat,
        longitude: lng,
        address: row.address ? String(row.address).slice(0, 500) : existing?.address || null,
        website: row.website ? String(row.website).slice(0, 500) : existing?.website || null,
      };
      if (existing) {
        const held = await prisma.fieldAuthority.findMany({
          where: { entityType: "location", entityId: existing.id },
        });
        const fieldAuthorities = Object.fromEntries(held.map((row) => [row.field, row.authority])) as Partial<
          Record<TrustedField, number>
        >;
        const merged = mergeExistingLocation(existing, incoming, provenance, { incomingAuthority, fieldAuthorities });
        await rememberObservation({
          entityId: existing.id,
          connector,
          sourceVersion,
          contentHash,
          seenAt: retrievedAt,
        });
        if (contentFingerprint(existing) === contentFingerprint({ ...existing, ...merged })) {
          state.status = "SKIPPED";
          state.error = "unchanged";
          state.locationId = existing.id;
          state.slug = existing.slug;
          continue;
        }
        const before = snapshotEntity(existing as unknown as Record<string, unknown>);
        const updated = await prisma.location.update({
          where: { id: existing.id },
          data: merged,
        });
        await persistFieldAuthorities({
          entityId: existing.id,
          source: connector,
          authority: incomingAuthority,
          fields: { name: updated.name, summary: updated.summary, address: updated.address, website: updated.website, latitude: updated.latitude, longitude: updated.longitude },
          observedAt: retrievedAt,
        });
        await prisma.sourceRecord.create({
          data: {
            locationId: existing.id,
            title: `${connector} catalog`,
            url: sourceUrl,
            sourceUrl,
            notes: `Upserted via batch ${batchId} row ${state.index}`,
            documentRef: sourceVersion,
            sourceVersion,
            etag,
            contentHash,
            confidence,
            connector,
            retrievedAt,
            licence: String(row.licence || batch.licence || ""),
          },
        });
        await prisma.ingestionChange.create({
          data: {
            locationId: existing.id,
            connector,
            action: "update",
            canonicalKey,
            beforeJson: before,
            afterJson: snapshotEntity(updated as unknown as Record<string, unknown>),
          },
        });
        await rememberExternalIdentity({ connector, externalId, entityId: existing.id });
        state.status = "APPLIED";
        state.locationId = existing.id;
        state.slug = existing.slug;
        applied += 1;
        continue;
      }
      const created = await prisma.location.create({
        data: {
          slug,
          name,
          summary: incoming.summary,
          description: row.description ? String(row.description).slice(0, 4000) : String(row.summary || name),
          latitude: lat,
          longitude: lng,
          address: incoming.address,
          website: incoming.website,
          email: row.email ? String(row.email).slice(0, 200) : null,
          phone: row.phone ? String(row.phone).slice(0, 80) : null,
          tagsJson: Array.isArray(row.tags) ? row.tags.slice(0, 20) : [],
          categoryId: category.id,
          provinceId: province.id,
          status: "DRAFT",
          verificationNotes: `Imported via batch ${batchId} row ${state.index}`,
          ownerId: options?.ownerId || batch.createdById,
          ...provenance,
        },
      });
      await prisma.sourceRecord.create({
        data: {
          locationId: created.id,
          title: `${connector} catalog`,
          url: sourceUrl,
          sourceUrl,
          notes: `Created via batch ${batchId} row ${state.index}`,
          documentRef: sourceVersion,
          sourceVersion,
          etag,
          contentHash,
          confidence,
          connector,
          retrievedAt,
          licence: String(row.licence || batch.licence || ""),
        },
      });
      await prisma.ingestionChange.create({
        data: {
          locationId: created.id,
          connector,
          action: "create",
          canonicalKey,
          beforeJson: {},
          afterJson: snapshotEntity(created as unknown as Record<string, unknown>),
        },
      });
      await rememberExternalIdentity({ connector, externalId, entityId: created.id });
      await rememberObservation({
        entityId: created.id,
        connector,
        sourceVersion,
        contentHash,
        seenAt: retrievedAt,
      });
      await persistFieldAuthorities({
        entityId: created.id,
        source: connector,
        authority: incomingAuthority,
        fields: {
          name: created.name,
          summary: created.summary,
          address: created.address,
          website: created.website,
          latitude: created.latitude,
          longitude: created.longitude,
        },
        observedAt: retrievedAt,
      });
      state.status = "APPLIED";
      state.locationId = created.id;
      state.slug = slug;
      applied += 1;
    } catch (error) {
      state.status = "FAILED";
      state.error = error instanceof Error ? error.message : String(error);
    }
    if (state.index % 25 === 0) await checkpoint();
  }

  await checkpoint();
  const seenIds = [...new Set(states.map((row) => row.locationId).filter((id): id is string => Boolean(id)))];
  const connector = String(batch.source);
  const seenAt = new Date();
  await markMissingFromSource(connector, seenIds, seenAt);
  invalidatePublicCaches();
  const errors = states.filter((row) => row.status === "FAILED");
  return { success: errors.length === 0, applied, idempotent: false, errors };
}
