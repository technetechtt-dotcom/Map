import { createHash } from "crypto";

export function slugifyName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function canonicalEntityKey(input: {
  name: string;
  provinceSlug: string;
  latitude: number;
  longitude: number;
}) {
  const name = slugifyName(input.name);
  const lat = input.latitude.toFixed(3);
  const lng = input.longitude.toFixed(3);
  return `${input.provinceSlug}|${name}|${lat}|${lng}`;
}

export function canonicalHash(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export function snapshotEntity(row: Record<string, unknown>) {
  return {
    name: row.name || null,
    summary: row.summary || null,
    latitude: row.latitude || null,
    longitude: row.longitude || null,
    source: row.source || row.coordSource || null,
    sourceVersion: row.sourceVersion || null,
    retrievedAt: row.retrievedAt || null,
    verificationTier: row.verificationTier || null,
    sourceUrl: row.sourceUrl || null,
    etag: row.etag || null,
    contentHash: row.contentHash || null,
    externalId: row.externalId || null,
  };
}

export function contentFingerprint(row: {
  name?: unknown;
  summary?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  address?: unknown;
  website?: unknown;
  verificationTier?: unknown;
}) {
  return JSON.stringify({
    name: row.name ?? null,
    summary: row.summary ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    address: row.address ?? null,
    website: row.website ?? null,
    verificationTier: row.verificationTier ?? null,
  });
}

export function resolveIdentityOrder() {
  return ["externalId", "canonicalKey", "slug"] as const;
}
