import { createHash } from "crypto";
import { prisma } from "./prisma";

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
};

export type ImportRowState = {
  index: number;
  rowHash: string;
  status: "PENDING" | "APPLIED" | "FAILED" | "SKIPPED";
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

function parseCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export function importRowHash(row: ImportSourceRow): string {
  const normalized = {
    name: String(row.name || "").trim().toLowerCase(),
    latitude: parseCoord(row.latitude),
    longitude: parseCoord(row.longitude),
    provinceId: row.provinceId || row.provinceSlug || "",
    categoryId: row.categoryId || row.categorySlug || "",
    address: String(row.address || "").trim().toLowerCase(),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function reportRows(reportJson: unknown, sourceRows: ImportSourceRow[]): ImportRowState[] {
  const existing =
    reportJson && typeof reportJson === "object" && Array.isArray((reportJson as { rows?: unknown }).rows)
      ? ((reportJson as { rows: ImportRowState[] }).rows)
      : [];
  const byIndex = new Map(existing.map((row) => [row.index, row]));
  return sourceRows.map((row, index) => {
    const prev = byIndex.get(index);
    const rowHash = importRowHash(row);
    if (prev && prev.rowHash === rowHash) return prev;
    return { index, rowHash, status: "PENDING" as const };
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
  const states = reportRows(batch.reportJson, rows);
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
      const lat = parseCoord(row.latitude);
      const lng = parseCoord(row.longitude);
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
      const category = await prisma.category.findFirst({
        where: {
          OR: [{ id: String(row.categoryId || defaultCategory?.id || "") }, { slug: String(row.categorySlug || "other") }].filter(
            (clause) => Object.values(clause)[0]
          ),
        },
      });
      if (!category) throw new Error("unknown category");
      const slug = `${slugify(name) || "location"}-${state.rowHash.slice(0, 10)}`;
      const existing = await prisma.location.findUnique({ where: { slug } });
      if (existing) {
        state.status = "APPLIED";
        state.locationId = existing.id;
        state.slug = slug;
        applied += 1;
        continue;
      }
      const created = await prisma.location.create({
        data: {
          slug,
          name,
          summary: String(row.summary || name).slice(0, 500),
          description: row.description ? String(row.description).slice(0, 4000) : String(row.summary || name),
          latitude: lat,
          longitude: lng,
          address: row.address ? String(row.address).slice(0, 500) : null,
          website: row.website ? String(row.website).slice(0, 500) : null,
          email: row.email ? String(row.email).slice(0, 200) : null,
          phone: row.phone ? String(row.phone).slice(0, 80) : null,
          tagsJson: Array.isArray(row.tags) ? row.tags.slice(0, 20) : [],
          categoryId: category.id,
          provinceId: province.id,
          status: "DRAFT",
          coordQuality: "estimated",
          coordSource: batch.source,
          sourceConfidence: "import",
          verificationNotes: `Imported via batch ${batchId} row ${state.index}`,
          ownerId: options?.ownerId || batch.createdById,
        },
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
  const errors = states.filter((row) => row.status === "FAILED");
  return { success: errors.length === 0, applied, idempotent: false, errors };
}
