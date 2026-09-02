import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  assertEcosystemAccess,
  assertEcosystemAssignmentChange,
  assertStatusChange,
  canEditDrafts,
  canPublish,
} from "@/lib/policy";
import { clientIp, readJsonLimited } from "@/lib/security";
import { invalidatePublicCaches } from "@/lib/server-memo";
import { ecosystemModel, ecosystemPatchData, isEcosystemType, type EcosystemType } from "@/lib/ecosystem";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const limited = await enforceRateLimitAsync(req, "ecosystem-write", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const { id } = await ctx.params;
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as Record<string, unknown>;
  const typeParam = String(body.type || req.nextUrl.searchParams.get("type") || "funding");
  if (!isEcosystemType(typeParam)) return jsonError("Unknown ecosystem type", 400);
  const type: EcosystemType = typeParam;

  const existing = await ecosystemModel(type).findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  const access = assertEcosystemAccess(auth.user, existing, "write");
  if (!access.ok) return jsonError(access.reason, 403);

  const assignment = assertEcosystemAssignmentChange(
    auth.user,
    existing,
    body.organisationId as string | null | undefined,
    body.provinceId as string | null | undefined
  );
  if (!assignment.ok) return jsonError(assignment.reason, 403);

  if (body.status) {
    const statusCheck = assertStatusChange(auth.user, String(body.status));
    if (!statusCheck.ok) return jsonError(statusCheck.reason, 403);
    if (body.status === "PUBLISHED" && !canPublish(auth.user)) {
      return jsonError("Only provincial or super administrators may publish ecosystem items", 403);
    }
  }

  const data = ecosystemPatchData(type, body);
  const item = await ecosystemModel(type).update({ where: { id }, data: data as never });
  await writeAudit({
    userId: auth.user.id,
    action: "UPDATE",
    entityType: type,
    entityId: id,
    metadata: { status: item.status },
    provinceId: item.provinceId,
    organisationId: item.organisationId,
    ipAddress: clientIp(req),
  });
  invalidatePublicCaches();
  return jsonOk({ item });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canPublish(auth.user)) return jsonError("Forbidden", 403);
  const { id } = await ctx.params;
  const typeParam = req.nextUrl.searchParams.get("type") || "funding";
  if (!isEcosystemType(typeParam)) return jsonError("Unknown ecosystem type", 400);
  const existing = await ecosystemModel(typeParam).findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  const access = assertEcosystemAccess(auth.user, existing, "write");
  if (!access.ok) return jsonError(access.reason, 403);

  const item = await ecosystemModel(typeParam).update({ where: { id }, data: { status: "ARCHIVED" } as Record<string, unknown> });
  await writeAudit({
    userId: auth.user.id,
    action: "ARCHIVE",
    entityType: typeParam,
    entityId: id,
    provinceId: item.provinceId,
    organisationId: item.organisationId,
    ipAddress: clientIp(req),
  });
  invalidatePublicCaches();
  return jsonOk({ item });
}
