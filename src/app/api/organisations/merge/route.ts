import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { isSuperAdmin } from "@/lib/policy";
import { readJsonLimited, clientIp } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = schema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400);
  if (body.data.sourceId === body.data.targetId) return jsonError("Cannot merge an organisation into itself", 400);

  const [source, target] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: body.data.sourceId } }),
    prisma.organisation.findUnique({ where: { id: body.data.targetId } }),
  ]);
  if (!source || !target) return jsonError("Organisation not found", 404);

  const result = await prisma.$transaction(async (tx) => {
    await tx.location.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.fundingCall.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.ecosystemEvent.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.programme.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.procurement.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.submission.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.organisationClaim.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.user.updateMany({ where: { organisationId: source.id }, data: { organisationId: target.id } });
    await tx.organisationRelationship.deleteMany({ where: { OR: [{ sourceId: source.id, targetId: target.id }, { sourceId: target.id, targetId: source.id }, { sourceId: source.id, targetId: source.id }] } });
    const fromSource = await tx.organisationRelationship.findMany({ where: { sourceId: source.id } });
    for (const rel of fromSource) {
      await tx.organisationRelationship.update({ where: { id: rel.id }, data: { sourceId: target.id } }).catch(() =>
        tx.organisationRelationship.delete({ where: { id: rel.id } })
      );
    }
    const toSource = await tx.organisationRelationship.findMany({ where: { targetId: source.id } });
    for (const rel of toSource) {
      await tx.organisationRelationship.update({ where: { id: rel.id }, data: { targetId: target.id } }).catch(() =>
        tx.organisationRelationship.delete({ where: { id: rel.id } })
      );
    }
    await tx.organisation.update({
      where: { id: source.id },
      data: { mergedIntoId: target.id, status: "ARCHIVED", aliasesJson: [source.name, source.slug] },
    });
    const merge = await tx.organisationMerge.create({
      data: {
        sourceId: source.id,
        targetId: target.id,
        performedById: auth.user.id,
        payloadJson: { sourceSlug: source.slug, targetSlug: target.slug },
      },
    });
    return merge;
  });

  await writeAudit({
    user: auth.user,
    action: "ORGANISATION_MERGE",
    entityType: "Organisation",
    entityId: target.id,
    metadata: { sourceId: source.id, mergeId: result.id },
    ipAddress: clientIp(req),
  });
  return jsonOk({ merge: result });
}
