import type { RecordStatus } from "@prisma/client";

export function parseJsonArray(value?: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseJson<T>(value?: unknown, fallback?: T): T | undefined {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function serializeArray(arr: string[] | undefined): string[] {
  return arr || [];
}

export type PublicLocation = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  imageUrl?: string | null;
  lastVerifiedAt?: string | null;
  verificationSource?: string | null;
  verificationNotes?: string | null;
  coordQuality?: string | null;
  coordSource?: string | null;
  verificationExpiresAt?: string | null;
  evidence?: { title?: string; url?: string; capturedAt?: string }[];
  opportunities: string[];
  assets: string[];
  tags: string[];
  category: { name: string; slug: string; color: string; icon: string };
  province: { name: string; slug: string; code: string };
  district?: { name: string; code: string } | null;
  municipality?: { name: string; code: string } | null;
  organisation?: { name: string; slug: string } | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shapeLocation(loc: any): PublicLocation {
  return {
    id: loc.id,
    slug: loc.slug,
    name: loc.name,
    summary: loc.summary,
    description: loc.description,
    latitude: loc.latitude,
    longitude: loc.longitude,
    status: loc.status,
    website: loc.website,
    email: loc.email,
    phone: loc.phone,
    address: loc.address,
    imageUrl: loc.imageUrl,
    lastVerifiedAt: loc.lastVerifiedAt ? new Date(loc.lastVerifiedAt).toISOString() : null,
    verificationSource: loc.verificationSource,
    verificationNotes: loc.verificationNotes ?? null,
    coordQuality: loc.coordQuality ?? "unknown",
    coordSource: loc.coordSource ?? null,
    verificationExpiresAt: loc.verificationExpiresAt
      ? new Date(loc.verificationExpiresAt).toISOString()
      : null,
    evidence: (parseJson<PublicLocation["evidence"]>(loc.evidenceJson, []) || []) as PublicLocation["evidence"],
    opportunities: parseJsonArray(loc.opportunitiesJson),
    assets: parseJsonArray(loc.assetsJson),
    tags: parseJsonArray(loc.tagsJson),
    category: {
      name: loc.category.name,
      slug: loc.category.slug,
      color: loc.category.color,
      icon: loc.category.icon,
    },
    province: {
      name: loc.province.name,
      slug: loc.province.slug,
      code: loc.province.code,
    },
    district: loc.district
      ? { name: loc.district.name, code: loc.district.code }
      : null,
    municipality: loc.municipality
      ? { name: loc.municipality.name, code: loc.municipality.code }
      : null,
    organisation: loc.organisation
      ? { name: loc.organisation.name, slug: loc.organisation.slug }
      : null,
  };
}

export const PUBLIC_STATUSES: RecordStatus[] = ["PUBLISHED", "VERIFIED"];
