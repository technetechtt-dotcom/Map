import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canVerify } from "@/lib/policy";
import { readJsonLimited, clientIp } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const claimSchema = z.object({
  organisationId: z.string().min(1),
  evidence: z.array(z.object({ title: z.string().min(1).max(200), url: z.string().url().optional() })).min(1).max(20),
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const claims = await prisma.organisationClaim.findMany({
    where: canVerify(auth.user)
      ? auth.user.role === "SUPER_ADMIN"
        ? {}
        : { organisation: { provinceId: auth.user.provinceId || "__none__" } }
      : { claimantId: auth.user.id },
    include: { organisation: { select: { id: true, name: true, slug: true, provinceId: true } }, claimant: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ claims });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = claimSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const organisation = await prisma.organisation.findUnique({ where: { id: body.data.organisationId } });
  if (!organisation || organisation.status === "ARCHIVED") return jsonError("Organisation not found", 404);
  const claim = await prisma.organisationClaim.create({
    data: { organisationId: organisation.id, claimantId: auth.user.id, evidenceJson: body.data.evidence, notes: body.data.notes },
  });
  await writeAudit({ user: auth.user, action: "ORGANISATION_CLAIM_SUBMIT", entityType: "OrganisationClaim", entityId: claim.id, metadata: { organisationId: organisation.id }, ipAddress: clientIp(req) });
  return jsonOk({ claim }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canVerify(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = z.object({ id: z.string(), status: z.enum(["APPROVED", "REJECTED", "REVOKED"]), notes: z.string().max(2000).optional() }).safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const claim = await prisma.organisationClaim.findUnique({ where: { id: body.data.id }, include: { organisation: true, claimant: true } });
  if (!claim) return jsonError("Not found", 404);
  if (auth.user.role !== "SUPER_ADMIN" && claim.organisation.provinceId !== auth.user.provinceId) return jsonError("Outside your province scope", 403);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.organisationClaim.update({ where: { id: claim.id }, data: { status: body.data.status, notes: body.data.notes, reviewedById: auth.user.id, reviewedAt: new Date() } });
    if (body.data.status === "APPROVED") {
      await tx.user.update({ where: { id: claim.claimantId }, data: { organisationId: claim.organisationId } });
    }
    return result;
  });
  await writeAudit({ user: auth.user, action: `ORGANISATION_CLAIM_${body.data.status}`, entityType: "OrganisationClaim", entityId: claim.id, provinceId: claim.organisation.provinceId, metadata: { organisationId: claim.organisationId, claimantId: claim.claimantId }, ipAddress: clientIp(req) });
  await notify({ type: "organisation.claim", to: claim.claimant.email, userId: claim.claimantId, subject: `Organisation claim ${body.data.status.toLowerCase()}`, body: `Your claim for ${claim.organisation.name} was ${body.data.status.toLowerCase()}.` });
  return jsonOk({ claim: updated });
}
