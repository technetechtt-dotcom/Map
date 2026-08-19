import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { canModerateSubmissions, isSuperAdmin } from "@/lib/policy";
import { clientIp, readJsonLimited, verifyCaptcha } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";
import type { WorkflowStatus } from "@prisma/client";

const createSchema = z.object({
  targetType: z.enum(["location", "organisation"]),
  targetId: z.string().max(40).optional(),
  targetSlug: z.string().max(80).optional(),
  submitterName: z.string().min(2).max(120),
  submitterEmail: z.string().email().max(200),
  message: z.string().min(10).max(4000),
  provinceId: z.string().max(40).optional(),
  captchaToken: z.string().optional(),
  website: z.string().max(0).optional(),
});

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "correction", { limit: 8, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = createSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });

  const captcha = await verifyCaptcha({
    token: body.data.captchaToken,
    honeypot: body.data.website,
    remoteIp: clientIp(req),
  });
  if (!captcha.ok) return jsonError(captcha.error, 400);

  const row = await prisma.correctionRequest.create({
    data: {
      targetType: body.data.targetType,
      targetId: body.data.targetId || null,
      targetSlug: body.data.targetSlug || null,
      submitterName: body.data.submitterName,
      submitterEmail: body.data.submitterEmail.toLowerCase(),
      message: body.data.message,
      provinceId: body.data.provinceId || null,
      status: "OPEN",
    },
  });

  await writeAudit({
    action: "CORRECTION_REQUEST",
    entityType: "CorrectionRequest",
    entityId: row.id,
    provinceId: row.provinceId,
    ipAddress: clientIp(req),
  });

  return jsonOk({ id: row.id, status: row.status }, 201);
}

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canModerateSubmissions(auth.user)) return jsonError("Forbidden", 403);

  const where = isSuperAdmin(auth.user)
    ? {}
    : { provinceId: auth.user.provinceId || "__none__" };

  const rows = await prisma.correctionRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return jsonOk({ requests: rows });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canModerateSubmissions(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const bodyResult = z.object({
    id: z.string().min(1),
    status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED", "REJECTED"]),
  }).safeParse(parsed.data);
  if (!bodyResult.success) return jsonError("Validation failed", 400, { issues: bodyResult.error.issues });
  const body = bodyResult.data;

  const existing = await prisma.correctionRequest.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("Not found", 404);
  if (
    !isSuperAdmin(auth.user) &&
    existing.provinceId &&
    existing.provinceId !== auth.user.provinceId
  ) {
    return jsonError("Outside province scope", 403);
  }

  const updated = await prisma.correctionRequest.update({
    where: { id: body.id },
    data: { status: body.status as WorkflowStatus },
  });
  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "CORRECTION_UPDATE",
    entityType: "CorrectionRequest",
    entityId: updated.id,
    provinceId: updated.provinceId,
    ipAddress: clientIp(req),
  });
  return jsonOk({ request: updated });
}
