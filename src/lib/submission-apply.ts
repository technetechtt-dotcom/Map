import type { Prisma } from "@prisma/client";
import { serializeArray } from "./shape";
import { ecosystemCreateData, isEcosystemType } from "./ecosystem";

type Tx = Prisma.TransactionClient;

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
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        categoryId: cat.id,
        provinceId,
        website: payload.website ? String(payload.website) : null,
        opportunitiesJson: serializeArray(Array.isArray(payload.opportunities) ? (payload.opportunities as string[]) : []),
        assetsJson: serializeArray(Array.isArray(payload.assets) ? (payload.assets as string[]) : []),
        tagsJson: ["community-submission"],
        status: "PENDING_REVIEW",
        ownerId: reviewerId,
        coordQuality: "unknown",
      },
    });
    return { createdLocationId: loc.id, createdEntityType: "location", createdEntityId: loc.id };
  }

  if (type === "organisation") {
    const name = String(payload.name || payload.title || "");
    if (!name) throw new Error("ORG_PAYLOAD");
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const org = await tx.organisation.create({
      data: {
        slug: `${slugBase}-${Date.now().toString(36)}`,
        name,
        type: "community-submission",
        description: String(payload.summary || ""),
        website: payload.website ? String(payload.website) : payload.url ? String(payload.url) : null,
        status: "PENDING_REVIEW",
        provinceId: existing.provinceId,
      },
    });
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
