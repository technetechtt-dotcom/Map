import type { RecordStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseJsonArray as parseTags } from "./shape";
import type { AuthUser } from "./policy";
import { ecosystemTenantWhere } from "./policy";

export const ECOSYSTEM_TYPES = ["funding", "events", "programmes", "procurement"] as const;
export type EcosystemType = (typeof ECOSYSTEM_TYPES)[number];

export function isEcosystemType(value: string): value is EcosystemType {
  return (ECOSYSTEM_TYPES as readonly string[]).includes(value);
}

export type EcosystemAccessRecord = {
  id: string;
  status: string;
  provinceId: string | null;
  organisationId: string | null;
};

type EcosystemDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<EcosystemAccessRecord | null>;
  create: (args: { data: never }) => Promise<EcosystemAccessRecord>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<EcosystemAccessRecord>;
};

export function ecosystemModel(type: EcosystemType): EcosystemDelegate {
  if (type === "events") return prisma.ecosystemEvent as unknown as EcosystemDelegate;
  if (type === "programmes") return prisma.programme as unknown as EcosystemDelegate;
  if (type === "procurement") return prisma.procurement as unknown as EcosystemDelegate;
  return prisma.fundingCall as unknown as EcosystemDelegate;
}

export async function getEcosystemItems(
  type: EcosystemType,
  provinceSlug?: string,
  options: { manage?: boolean; status?: string; user?: AuthUser | null } = {}
) {
  const provinceFilter = provinceSlug
    ? {
        province: {
          OR: [{ slug: provinceSlug }, { code: provinceSlug }, { name: provinceSlug }],
        },
      }
    : {};
  const tenantFilter = options.manage && options.user ? ecosystemTenantWhere(options.user) : {};
  const statusFilter: { status?: RecordStatus } = options.manage
    ? options.status
      ? { status: options.status as RecordStatus }
      : {}
    : { status: "PUBLISHED" };

  const where = { ...statusFilter, ...provinceFilter, ...tenantFilter };
  const include = { province: true, organisation: true };

  if (type === "programmes") {
    const rows = await prisma.programme.findMany({
      where,
      include,
      orderBy: { title: "asc" },
    });
    return rows.map((r) => ({ ...r, type, tags: parseTags(r.tagsJson) }));
  }
  if (type === "events") {
    const rows = await prisma.ecosystemEvent.findMany({
      where,
      include,
      orderBy: { startsAt: "asc" },
    });
    return rows.map((r) => ({ ...r, type, tags: parseTags(r.tagsJson) }));
  }
  if (type === "procurement") {
    const rows = await prisma.procurement.findMany({
      where,
      include,
      orderBy: { closingDate: "asc" },
    });
    return rows.map((r) => ({ ...r, type, tags: parseTags(r.tagsJson) }));
  }
  const rows = await prisma.fundingCall.findMany({
    where,
    include,
    orderBy: { deadline: "asc" },
  });
  return rows.map((r) => ({ ...r, type, tags: parseTags(r.tagsJson) }));
}

export function slugFromTitle(title: string) {
  return (
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || `item-${Date.now().toString(36)}`
  );
}

export function ecosystemCreateData(type: EcosystemType, body: Record<string, unknown>, status: string, provinceId: string | null, organisationId: string | null) {
  const tagsJson = Array.isArray(body.tags) ? body.tags : [];
  const slug = String(body.slug || `${slugFromTitle(String(body.title || body.name || "item"))}-${Date.now().toString(36)}`);
  const title = String(body.title || body.name || "");
  const summary = String(body.summary || "");
  const description = body.description ? String(body.description) : null;
  const base = { slug, title, summary, description, status, provinceId, organisationId, tagsJson };
  if (type === "events") {
    return {
      ...base,
      startsAt: new Date(String(body.startsAt || Date.now())),
      endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
      venue: body.venue ? String(body.venue) : null,
      onlineUrl: body.onlineUrl ? String(body.onlineUrl) : null,
      latitude: body.latitude != null ? Number(body.latitude) : null,
      longitude: body.longitude != null ? Number(body.longitude) : null,
    };
  }
  if (type === "programmes") {
    return {
      ...base,
      startDate: body.startDate ? new Date(String(body.startDate)) : null,
      endDate: body.endDate ? new Date(String(body.endDate)) : null,
    };
  }
  if (type === "procurement") {
    return {
      ...base,
      closingDate: body.closingDate ? new Date(String(body.closingDate)) : null,
      budget: body.budget ? String(body.budget) : null,
      url: body.url ? String(body.url) : null,
      referenceNumber: body.referenceNumber ? String(body.referenceNumber) : null,
      issuingAuthority: body.issuingAuthority ? String(body.issuingAuthority) : null,
    };
  }
  return {
    ...base,
    amount: body.amount ? String(body.amount) : null,
    deadline: body.deadline ? new Date(String(body.deadline)) : null,
    url: body.url ? String(body.url) : null,
    publishedAt: status === "PUBLISHED" ? new Date() : null,
  };
}

export async function getEcosystemBySlug(type: EcosystemType, slug: string) {
  const include = { province: true, organisation: true };
  if (type === "programmes") {
    const row = await prisma.programme.findFirst({ where: { slug, status: "PUBLISHED" }, include });
    return row ? { ...row, type, tags: parseTags(row.tagsJson) } : null;
  }
  if (type === "events") {
    const row = await prisma.ecosystemEvent.findFirst({ where: { slug, status: "PUBLISHED" }, include });
    return row ? { ...row, type, tags: parseTags(row.tagsJson) } : null;
  }
  if (type === "procurement") {
    const row = await prisma.procurement.findFirst({ where: { slug, status: "PUBLISHED" }, include });
    return row ? { ...row, type, tags: parseTags(row.tagsJson) } : null;
  }
  const row = await prisma.fundingCall.findFirst({ where: { slug, status: "PUBLISHED" }, include });
  return row ? { ...row, type, tags: parseTags(row.tagsJson) } : null;
}

export function ecosystemPatchData(type: EcosystemType, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const key of ["title", "summary", "description", "status", "slug", "url", "amount", "budget", "venue", "onlineUrl", "referenceNumber", "issuingAuthority"]) {
    if (body[key] !== undefined) data[key] = body[key] === null || body[key] === "" ? null : String(body[key]);
  }
  if (Array.isArray(body.tags)) data.tagsJson = body.tags;
  if (body.provinceId !== undefined) data.provinceId = body.provinceId || null;
  if (body.organisationId !== undefined) data.organisationId = body.organisationId || null;
  for (const key of ["startsAt", "endsAt", "startDate", "endDate", "deadline", "closingDate"]) {
    if (body[key] !== undefined) data[key] = body[key] ? new Date(String(body[key])) : null;
  }
  if (body.latitude !== undefined) data.latitude = body.latitude == null || body.latitude === "" ? null : Number(body.latitude);
  if (body.longitude !== undefined) data.longitude = body.longitude == null || body.longitude === "" ? null : Number(body.longitude);
  if (type === "funding" && body.status === "PUBLISHED") data.publishedAt = new Date();
  if (type === "funding" && body.status && body.status !== "PUBLISHED") data.publishedAt = null;
  return data;
}
