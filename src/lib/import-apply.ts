import { createHash } from "crypto";
import { prisma } from "./prisma";
import { parseLatitude, parseLongitude } from "./coords";
import { canonicalEntityKey, contentFingerprint, snapshotEntity } from "./ingestion/resolve";
import { deriveVerificationTier, isProtectedVerificationTier } from "./verification";
import { validatePointAssignment } from "./geo-validation";

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
};

export function mergeExistingLocation(
  existing: ExistingLocation,
  incoming: { name: string; summary: string; latitude: number; longitude: number; address?: string | null; website?: string | null },
  provenance: Record<string, unknown>
) {
  const protectedRecord = isProtectedVerificationTier(existing.verificationTier);
  return {
    summary: incoming.summary || existing.summary,
    address: incoming.address || existing.address,
    website: incoming.website || existing.website,
    ...provenance,
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

async function resolveExistingLocation(opts: {
  connector: string;
  externalId?: string;
  canonicalKey: string;
  slug: string;
}) {
  if (opts.externalId) {
    const ident = await prisma.externalIdentity.findUnique({
      where: {
        connector_externalId_entityType: {
          connector: opts.connector,
          externalId: opts.externalId,
          entityType: "location",
        },
      },
    });
    if (ident) {
      const byId = await prisma.location.findUnique({ where: { id: ident.entityId } });
      if (byId) return byId;
    }
    const byExternal = await prisma.location.findFirst({ where: { externalId: opts.externalId } });
    if (byExternal) return byExternal;
  }
  return (
    (await prisma.location.findUnique({ where: { canonicalKey: opts.canonicalKey } })) ||
    (await prisma.location.findUnique({ where: { slug: opts.slug } }))
  );
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
  const rows = Array.isArray(batch.payloadJson) ? (batch.payloadJson as ImportSourceRow[]) : [];
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
      const canonicalKey = canonicalEntityKey({
        name,
        provinceSlug: province.slug,
        latitude: lat,
        longitude: lng,
      });
      const connector = String(row.source || batch.source);
      const externalId = row.externalId ? String(row.externalId) : undefined;
      const existing = await resolveExistingLocation({ connector, externalId, canonicalKey, slug });
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
        const merged = mergeExistingLocation(existing, incoming, provenance);
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
  const errors = states.filter((row) => row.status === "FAILED");
  return { success: errors.length === 0, applied, idempotent: false, errors };
}
