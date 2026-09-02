import { NextRequest } from "next/server";
import { jsonOk, requireSession, jsonError, enforceRateLimitAsync } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  assertOrganisationAccess,
  assertProvinceAccess,
  assertStatusChange,
  canEditDrafts,
  canPublish,
  coerceCreateStatus,
  isOrgAdmin,
  isContributor,
} from "@/lib/policy";
import { clientIp, readJsonLimited } from "@/lib/security";
import { invalidatePublicCaches } from "@/lib/server-memo";
import {
  ECOSYSTEM_TYPES,
  ecosystemCreateData,
  ecosystemModel,
  getEcosystemItems,
  isEcosystemType,
  type EcosystemType,
} from "@/lib/ecosystem";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "ecosystem", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const typeParam = req.nextUrl.searchParams.get("type") || "funding";
  const type: EcosystemType = isEcosystemType(typeParam) ? typeParam : "funding";
  const province = req.nextUrl.searchParams.get("province") || "";
  const scope = req.nextUrl.searchParams.get("scope") || "";
  const status = req.nextUrl.searchParams.get("status") || "";

  if (scope === "manage") {
    const auth = await requireSession();
    if (auth.error) return auth.error;
    if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);
    const items = await getEcosystemItems(type, province || undefined, {
      manage: true,
      status: status || undefined,
      user: auth.user,
    });
    return jsonOk({ items, types: ECOSYSTEM_TYPES });
  }

  const items = await getEcosystemItems(type, province || undefined);
  return jsonOk({ items });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "ecosystem-create", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as Record<string, unknown>;
  const typeParam = String(body.type || "funding");
  if (!isEcosystemType(typeParam)) return jsonError("Unknown ecosystem type", 400);
  const type = typeParam;

  if (!(body.slug || body.title || body.name) || !body.summary) {
    return jsonError("title and summary required");
  }

  const status = coerceCreateStatus(auth.user, body.status as string | undefined);
  const statusCheck = assertStatusChange(auth.user, status);
  if (!statusCheck.ok) return jsonError(statusCheck.reason, 403);

  const provinceId = (body.provinceId as string) || auth.user.provinceId || null;
  const organisationId = (body.organisationId as string) || auth.user.organisationId || null;

  const prov = assertProvinceAccess(auth.user, provinceId);
  if (!prov.ok) return jsonError(prov.reason, 403);
  if (organisationId) {
    const org = assertOrganisationAccess(auth.user, organisationId);
    if (!org.ok) return jsonError(org.reason, 403);
  }
  if ((isOrgAdmin(auth.user) || isContributor(auth.user)) && !organisationId) {
    return jsonError("Organisation assignment required for your role", 403);
  }
  if ((body.status === "PUBLISHED" || status === "PUBLISHED") && !canPublish(auth.user)) {
    return jsonError("Only provincial or super administrators may publish ecosystem items", 403);
  }

  const data = ecosystemCreateData(type, body, status, provinceId, organisationId);
  const created = await ecosystemModel(type).create({ data: data as never });

  await writeAudit({
    userId: auth.user.id,
    action: "CREATE",
    entityType: type,
    entityId: created.id,
    metadata: { status },
    provinceId,
    organisationId,
    ipAddress: clientIp(req),
  });
  invalidatePublicCaches();
  return jsonOk({ item: created }, 201);
}
