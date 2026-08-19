import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canPublish, canVerify } from "@/lib/policy";
import { clientIp, readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

const relationshipSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.enum(["PARTNER_OF", "FUNDED_BY", "SUPPLIER_TO", "INCUBATED_BY", "TRAINED_BY", "MEMBER_OF", "INVESTED_IN"]),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "VERIFIED", "PUBLISHED"]).default("DRAFT"),
  evidence: z.array(z.object({ title: z.string().max(200), url: z.string().url().optional() })).max(20).default([]),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const organisationId = req.nextUrl.searchParams.get("organisationId") || undefined;
  const rows = await prisma.organisationRelationship.findMany({
    where: {
      status: "PUBLISHED",
      ...(organisationId ? { OR: [{ sourceId: organisationId }, { targetId: organisationId }] } : {}),
    },
    include: {
      source: { select: { id: true, slug: true, name: true, type: true, latitude: true, longitude: true } },
      target: { select: { id: true, slug: true, name: true, type: true, latitude: true, longitude: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  return jsonOk({ relationships: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canVerify(auth.user)) return jsonError("Only provincial or super administrators may create relationships", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = relationshipSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  if (body.data.sourceId === body.data.targetId) return jsonError("An organisation cannot relate to itself", 400);
  if (body.data.status === "PUBLISHED" && !canPublish(auth.user)) return jsonError("Forbidden", 403);

  const organisations = await prisma.organisation.findMany({
    where: { id: { in: [body.data.sourceId, body.data.targetId] } },
    select: { id: true, provinceId: true },
  });
  if (organisations.length !== 2) return jsonError("Organisation not found", 404);
  if (auth.user.role !== "SUPER_ADMIN" && organisations.some((org) => org.provinceId !== auth.user.provinceId)) {
    return jsonError("Outside your province scope", 403);
  }

  const { evidence, validFrom, validUntil, ...relationshipData } = body.data;
  const relationship = await prisma.organisationRelationship.create({
    data: {
      ...relationshipData,
      evidenceJson: evidence,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      createdById: auth.user.id,
    },
  });
  await writeAudit({
    user: auth.user,
    action: "CREATE_RELATIONSHIP",
    entityType: "OrganisationRelationship",
    entityId: relationship.id,
    provinceId: auth.user.provinceId,
    ipAddress: clientIp(req),
    metadata: { sourceId: relationship.sourceId, targetId: relationship.targetId, type: relationship.type, status: relationship.status },
  });
  return jsonOk({ relationship }, 201);
}
