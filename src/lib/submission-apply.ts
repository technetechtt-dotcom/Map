import type { Prisma } from "@prisma/client";
import { serializeArray } from "./shape";
import { ecosystemCreateData, isEcosystemType } from "./ecosystem";

type Tx = Prisma.TransactionClient;

function csvOrArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function applyApprovedSubmission(
  tx: Tx,
  existing: { id: string; type: string; payloadJson: unknown; provinceId: string | null; createdLocationId: string | null; createdEntityId?: string | null },
  reviewerId: string
) {
  const payload = (existing.payloadJson || {}) as Record<string, unknown>;
  const type = existing.type || "location";

  if (existing.createdLocationId || existing.createdEntityId) {
    return { createdLocationId: existing.createdLocationId, createdEntityType: type, createdEntityId: existing.createdEntityId || existing.createdLocationId };
  }

  if (type === "location") {
    if (!payload.name || payload.latitude == null || payload.longitude == null) {
      throw new Error("LOCATION_PAYLOAD");
    }
    const cat = await tx.category.findFirst({
      where: payload.categorySlug ? { slug: String(payload.categorySlug) } : { slug: "knowledge-hub" },
    });
    const provinceId =
      existing.provinceId ||
      (
        await tx.province.findFirst({
          where: payload.provinceSlug
            ? { OR: [{ slug: String(payload.provinceSlug) }, { code: String(payload.provinceSlug) }] }
            : { code: "NC" },
        })
      )?.id;
    if (!cat || !provinceId) throw new Error("CATEGORY_OR_PROVINCE");
    const slugBase = String(payload.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60);
    const loc = await tx.location.create({
      data: {
        slug: `${slugBase}-${Date.now().toString(36)}`,
        name: String(payload.name),
        summary: String(payload.summary || "") || "Community-submitted listing pending full verification.",
        description: payload.description ? String(payload.description) : null,
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        categoryId: cat.id,
        provinceId,
        website: payload.website ? String(payload.website) : payload.url ? String(payload.url) : null,
        email: payload.email ? String(payload.email) : null,
        phone: payload.phone ? String(payload.phone) : null,
        address: payload.address ? String(payload.address) : null,
        opportunitiesJson: serializeArray(csvOrArray(payload.opportunities)),
        assetsJson: serializeArray(csvOrArray(payload.assets)),
        tagsJson: ["community-submission", ...csvOrArray(payload.tags)],
        evidenceJson: csvOrArray(payload.evidence).map((url) => ({ title: "Evidence", url })),
        status: "PENDING_REVIEW",
        ownerId: reviewerId,
        coordQuality: payload.address ? "address" : "unknown",
      },
    });
    return { createdLocationId: loc.id, createdEntityType: "location", createdEntityId: loc.id };
  }

  if (type === "organisation") {
    const name = String(payload.name || payload.title || "");
    if (!name) throw new Error("ORG_PAYLOAD");
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const locationSlugs = csvOrArray(payload.locationSlugs);
    const org = await tx.organisation.create({
      data: {
        slug: `${slugBase}-${Date.now().toString(36)}`,
        name,
        type: String(payload.organisationType || payload.type || "community-submission"),
        description: String(payload.summary || payload.description || ""),
        website: payload.website ? String(payload.website) : payload.url ? String(payload.url) : null,
        email: payload.email || payload.orgEmail ? String(payload.email || payload.orgEmail) : null,
        phone: payload.phone || payload.orgPhone ? String(payload.phone || payload.orgPhone) : null,
        address: payload.address ? String(payload.address) : null,
        logoUrl: payload.logoUrl ? String(payload.logoUrl) : null,
        latitude: payload.latitude != null ? Number(payload.latitude) : null,
        longitude: payload.longitude != null ? Number(payload.longitude) : null,
        servicesJson: csvOrArray(payload.services),
        skillsJson: csvOrArray(payload.skills),
        technologiesJson: csvOrArray(payload.technologies),
        locationSlugsJson: locationSlugs,
        verificationEvidenceJson: csvOrArray(payload.evidence).map((url) => ({ title: "Evidence", url })),
        status: "PENDING_REVIEW",
        provinceId: existing.provinceId,
      },
    });
    if (locationSlugs.length) {
      await tx.location.updateMany({ where: { slug: { in: locationSlugs } }, data: { organisationId: org.id } });
    }
    return { createdLocationId: null, createdEntityType: "organisation", createdEntityId: org.id };
  }

  if (isEcosystemType(type)) {
    const title = String(payload.title || payload.name || "");
    if (!title || !payload.summary) throw new Error("ECOSYSTEM_PAYLOAD");
    const created = await (type === "events"
      ? tx.ecosystemEvent.create({
          data: ecosystemCreateData(type, payload, "PENDING_REVIEW", existing.provinceId, null) as never,
        })
      : type === "programmes"
        ? tx.programme.create({
            data: ecosystemCreateData(type, payload, "PENDING_REVIEW", existing.provinceId, null) as never,
          })
        : type === "procurement"
          ? tx.procurement.create({
              data: ecosystemCreateData(type, payload, "PENDING_REVIEW", existing.provinceId, null) as never,
            })
          : tx.fundingCall.create({
              data: ecosystemCreateData(type, payload, "PENDING_REVIEW", existing.provinceId, null) as never,
            }));
    return { createdLocationId: null, createdEntityType: type, createdEntityId: created.id };
  }

  throw new Error("UNSUPPORTED_TYPE");
}

function pickSubmitted(existingValue: unknown, submittedValue: unknown) {
  if (submittedValue == null || submittedValue === "") return { value: existingValue, changed: false };
  if (existingValue == null || existingValue === "") return { value: submittedValue, changed: true };
  if (String(existingValue) === String(submittedValue)) return { value: existingValue, changed: false };
  return { value: submittedValue, changed: true };
}

function mergeStringArrays(existingJson: unknown, submitted: string[]) {
  const existing = Array.isArray(existingJson)
    ? existingJson.map(String)
    : typeof existingJson === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(existingJson);
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })()
      : [];
  if (!submitted.length) return { value: existing, changed: false };
  const merged = Array.from(new Set([...existing, ...submitted]));
  const changed = merged.length !== existing.length || merged.some((v, i) => v !== existing[i]);
  return { value: merged, changed };
}

/** Apply submitted payload onto an existing catalogue entity (true field merge). */
export async function mergeSubmissionIntoExisting(
  tx: Tx,
  existing: { id: string; type: string; payloadJson: unknown; provinceId: string | null },
  targetId: string,
  _reviewerId: string
) {
  const payload = (existing.payloadJson || {}) as Record<string, unknown>;
  const type = existing.type || "location";
  const changedFields: string[] = [];

  if (type === "organisation") {
    const current = await tx.organisation.findUnique({ where: { id: targetId } });
    if (!current) throw new Error("MERGE_TARGET_MISSING");
    const data: Record<string, unknown> = {};
    const scalar: Array<[string, unknown]> = [
      ["description", payload.summary || payload.description],
      ["website", payload.website || payload.url],
      ["email", payload.email || payload.orgEmail],
      ["phone", payload.phone || payload.orgPhone],
      ["address", payload.address],
      ["logoUrl", payload.logoUrl],
      ["type", payload.organisationType || payload.type],
    ];
    for (const [key, submitted] of scalar) {
      const picked = pickSubmitted((current as Record<string, unknown>)[key], submitted ? String(submitted) : null);
      if (picked.changed) {
        data[key] = picked.value;
        changedFields.push(key);
      }
    }
    for (const [key, column] of [
      ["services", "servicesJson"],
      ["skills", "skillsJson"],
      ["technologies", "technologiesJson"],
    ] as const) {
      const merged = mergeStringArrays((current as Record<string, unknown>)[column], csvOrArray(payload[key]));
      if (merged.changed) {
        data[column] = merged.value;
        changedFields.push(column);
      }
    }
    const locationSlugs = csvOrArray(payload.locationSlugs);
    if (locationSlugs.length) {
      const mergedSlugs = mergeStringArrays(current.locationSlugsJson, locationSlugs);
      if (mergedSlugs.changed) {
        data.locationSlugsJson = mergedSlugs.value;
        changedFields.push("locationSlugsJson");
      }
      await tx.location.updateMany({ where: { slug: { in: locationSlugs } }, data: { organisationId: current.id } });
    }
    if (Object.keys(data).length) {
      await tx.organisation.update({ where: { id: targetId }, data });
    }
    return { createdLocationId: null, createdEntityType: "organisation", createdEntityId: targetId, changedFields };
  }

  if (type === "location") {
    const current = await tx.location.findUnique({ where: { id: targetId } });
    if (!current) throw new Error("MERGE_TARGET_MISSING");
    const data: Record<string, unknown> = {};
    for (const [key, submitted] of [
      ["summary", payload.summary],
      ["description", payload.description],
      ["website", payload.website || payload.url],
      ["email", payload.email],
      ["phone", payload.phone],
      ["address", payload.address],
    ] as const) {
      const picked = pickSubmitted((current as Record<string, unknown>)[key], submitted ? String(submitted) : null);
      if (picked.changed) {
        data[key] = picked.value;
        changedFields.push(key);
      }
    }
    for (const [key, column] of [
      ["opportunities", "opportunitiesJson"],
      ["assets", "assetsJson"],
      ["tags", "tagsJson"],
    ] as const) {
      const merged = mergeStringArrays((current as Record<string, unknown>)[column], csvOrArray(payload[key]));
      if (merged.changed) {
        data[column] = serializeArray(merged.value);
        changedFields.push(column);
      }
    }
    if (Object.keys(data).length) await tx.location.update({ where: { id: targetId }, data });
    return { createdLocationId: targetId, createdEntityType: "location", createdEntityId: targetId, changedFields };
  }

  if (isEcosystemType(type)) {
    const model =
      type === "events"
        ? tx.ecosystemEvent
        : type === "programmes"
          ? tx.programme
          : type === "procurement"
            ? tx.procurement
            : tx.fundingCall;
    const current = await model.findUnique({ where: { id: targetId } });
    if (!current) throw new Error("MERGE_TARGET_MISSING");
    const data: Record<string, unknown> = {};
    for (const [key, submitted] of [
      ["summary", payload.summary],
      ["description", payload.description || payload.eligibility],
      ["url", payload.applicationUrl || payload.url],
      ["amount", payload.amount],
      ["budget", payload.budget],
      ["venue", payload.venue],
      ["onlineUrl", payload.onlineUrl || payload.registrationUrl],
      ["referenceNumber", payload.referenceNumber],
      ["issuingAuthority", payload.issuingAuthority],
      ["applicationUrl", payload.applicationUrl],
      ["applicationProcess", payload.applicationProcess],
      ["targetAudience", payload.targetAudience],
      ["audience", payload.audience || payload.targetAudience],
      ["providerName", payload.provider || payload.providerName],
      ["deliveryMethod", payload.deliveryMethod],
      ["eligibility", payload.eligibility],
      ["cost", payload.cost],
      ["attendanceFormat", payload.attendanceFormat],
      ["town", payload.town],
      ["closingTime", payload.closingTime],
      ["procurementCategory", payload.procurementCategory || payload.category],
    ] as const) {
      if (!(key in current)) continue;
      const picked = pickSubmitted((current as Record<string, unknown>)[key], submitted ? String(submitted) : null);
      if (picked.changed) {
        data[key] = picked.value;
        changedFields.push(key);
      }
    }
    if (Array.isArray(payload.sectors) || Array.isArray(payload.tags)) {
      const merged = mergeStringArrays((current as { tagsJson?: unknown }).tagsJson, [
        ...csvOrArray(payload.tags),
        ...csvOrArray(payload.sectors),
      ]);
      if (merged.changed) {
        data.tagsJson = merged.value;
        changedFields.push("tagsJson");
      }
    }
    if (Object.keys(data).length) await model.update({ where: { id: targetId }, data });
    return { createdLocationId: null, createdEntityType: type, createdEntityId: targetId, changedFields };
  }

  throw new Error("UNSUPPORTED_TYPE");
}
