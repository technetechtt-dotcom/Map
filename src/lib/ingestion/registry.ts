import { createHash } from "crypto";
import { prisma } from "../prisma";
import { slugifyName } from "./resolve";

export function nationalCanonicalId(input: {
  entityType: string;
  registrationNumber?: string | null;
  domain?: string | null;
  name: string;
  provinceSlug?: string | null;
}) {
  if (input.registrationNumber) return `${input.entityType}:reg:${input.registrationNumber.trim().toLowerCase()}`;
  if (input.domain) return `${input.entityType}:domain:${input.domain.trim().toLowerCase()}`;
  return `${input.entityType}:name:${input.provinceSlug || "za"}:${slugifyName(input.name)}`;
}

export async function upsertNationalEntity(input: {
  entityType: string;
  displayName: string;
  registrationNumber?: string | null;
  domain?: string | null;
  provinceSlug?: string | null;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  evidence?: unknown;
}) {
  const canonicalId = nationalCanonicalId({
    entityType: input.entityType,
    registrationNumber: input.registrationNumber,
    domain: input.domain,
    name: input.displayName,
    provinceSlug: input.provinceSlug,
  });
  return prisma.nationalEntity.upsert({
    where: { canonicalId },
    create: {
      entityType: input.entityType,
      canonicalId,
      displayName: input.displayName,
      registrationNumber: input.registrationNumber || null,
      domain: input.domain || null,
      provinceSlug: input.provinceSlug || null,
      linkedEntityType: input.linkedEntityType || null,
      linkedEntityId: input.linkedEntityId || null,
      evidenceJson: input.evidence ?? [],
    },
    update: {
      displayName: input.displayName,
      linkedEntityType: input.linkedEntityType || undefined,
      linkedEntityId: input.linkedEntityId || undefined,
    },
  });
}

export function evidenceFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value || {})).digest("hex").slice(0, 16);
}
