import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { isSuperAdmin } from "@/lib/policy";
import { readJsonLimited, clientIp } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { invalidatePublicCaches } from "@/lib/server-memo";

const schema = z.object({
  action: z.enum(["merge", "reject-match", "split", "relink"]),
  sourceId: z.string().min(1),
  targetId: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = schema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400);
  const { action, sourceId, targetId, notes } = body.data;
  if ((action === "merge" || action === "relink") && !targetId) return jsonError("targetId required", 400);
  if (sourceId === targetId) return jsonError("source and target must differ", 400);

  const source = await prisma.location.findUnique({ where: { id: sourceId } });
  if (!source) return jsonError("Location not found", 404);
  const target = targetId ? await prisma.location.findUnique({ where: { id: targetId } }) : null;
  if (targetId && !target) return jsonError("Target location not found", 404);

  const result = await prisma.$transaction(async (tx) => {
    if (action === "merge" && target) {
      await tx.sourceRecord.updateMany({ where: { locationId: source.id }, data: { locationId: target.id } });
      await tx.ingestionChange.updateMany({ where: { locationId: source.id }, data: { locationId: target.id } });
      await tx.location.update({
        where: { id: source.id },
        data: { status: "ARCHIVED", staleAt: new Date() },
      });
    }
    if (action === "split") {
      await tx.location.update({
        where: { id: source.id },
        data: { canonicalKey: `${source.canonicalKey || source.slug}-split-${Date.now()}` },
      });
    }
    if (action === "relink" && target) {
      await tx.location.update({ where: { id: source.id }, data: { organisationId: target.organisationId } });
    }
    return tx.entityReviewAction.create({
      data: {
        action,
        entityType: "location",
        sourceId,
        targetId: targetId || null,
        actorId: auth.user.id,
        notes: notes || null,
        beforeJson: { sourceSlug: source.slug, sourceStatus: source.status },
        afterJson: { targetSlug: target?.slug || null, action },
      },
    });
  });

  invalidatePublicCaches();
  await writeAudit({
    user: auth.user,
    action: `LOCATION_${action.toUpperCase().replace("-", "_")}`,
    entityType: "Location",
    entityId: target?.id || source.id,
    metadata: { sourceId, targetId, reviewId: result.id },
    ipAddress: clientIp(req),
  });
  return jsonOk({ review: result });
}

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;
  const [duplicates, missing, campaigns, actions] = await Promise.all([
    prisma.location.findMany({
      where: { status: { in: ["DRAFT", "PENDING_REVIEW"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, slug: true, name: true, status: true, verificationTier: true, missingFromSource: true, consecutiveMisses: true },
    }),
    prisma.location.findMany({
      where: { missingFromSource: true },
      take: 50,
      select: { id: true, slug: true, name: true, consecutiveMisses: true, lastObservedAt: true },
    }),
    prisma.reverificationCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.entityReviewAction.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  return jsonOk({ duplicates, missing, campaigns, actions });
}
