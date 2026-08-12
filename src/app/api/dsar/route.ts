import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimit } from "@/lib/api";
import { canModerateSubmissions, isSuperAdmin } from "@/lib/policy";
import { clientIp, readJsonLimited, verifyCaptcha } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";
import type { WorkflowStatus } from "@prisma/client";

const createSchema = z.object({
  type: z.enum(["access", "correction", "deletion", "withdraw_consent"]),
  requesterEmail: z.string().email().max(200),
  requesterName: z.string().max(120).optional(),
  details: z.string().max(4000).optional(),
  provinceId: z.string().max(40).optional(),
  captchaToken: z.string().optional(),
  website: z.string().max(0).optional(),
});

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "dsar", { limit: 5, windowMs: 60 * 60_000 });
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

  const row = await prisma.dataSubjectRequest.create({
    data: {
      type: body.data.type,
      requesterEmail: body.data.requesterEmail.toLowerCase(),
      requesterName: body.data.requesterName || null,
      details: body.data.details || null,
      provinceId: body.data.provinceId || null,
      status: "OPEN",
    },
  });

  await writeAudit({
    action: "DSAR_CREATE",
    entityType: "DataSubjectRequest",
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

  const rows = await prisma.dataSubjectRequest.findMany({
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
  const body = parsed.data as { id?: string; status?: string; handledNotes?: string };
  if (!body.id || !body.status) return jsonError("id and status required");

  const existing = await prisma.dataSubjectRequest.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("Not found", 404);
  if (
    !isSuperAdmin(auth.user) &&
    existing.provinceId &&
    existing.provinceId !== auth.user.provinceId
  ) {
    return jsonError("Outside province scope", 403);
  }

  const updated = await prisma.dataSubjectRequest.update({
    where: { id: body.id },
    data: {
      status: body.status as WorkflowStatus,
      handledNotes: body.handledNotes || null,
    },
  });
  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "DSAR_UPDATE",
    entityType: "DataSubjectRequest",
    entityId: updated.id,
    provinceId: updated.provinceId,
  });
  return jsonOk({ request: updated });
}
