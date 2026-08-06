import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimit } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { canPublish } from "@/lib/policy";
import { submissionSchema } from "@/lib/validation";
import { clientIp, readJsonLimited, verifyCaptcha } from "@/lib/security";
import { log } from "@/lib/logger";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;

  const rows = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return jsonOk({
    submissions: rows.map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      submitterName: s.submitterName,
      submitterEmail: s.submitterEmail,
      notes: s.notes,
      reviewedNotes: s.reviewedNotes,
      createdAt: s.createdAt,
      payload: JSON.parse(s.payloadJson),
    })),
  });
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "submission", { limit: 8, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);

  const bodyResult = submissionSchema.safeParse(parsed.data);
  if (!bodyResult.success) {
    return jsonError("Validation failed", 400, { issues: bodyResult.error.issues });
  }
  const body = bodyResult.data;

  const captcha = await verifyCaptcha({
    token: body.captchaToken,
    honeypot: body.website,
    remoteIp: clientIp(req),
  });
  if (!captcha.ok) return jsonError(captcha.error, 400);

  const created = await prisma.submission.create({
    data: {
      type: body.type || "location",
      payloadJson: JSON.stringify(body.payload),
      submitterName: body.submitterName,
      submitterEmail: body.submitterEmail,
      notes: body.notes || null,
      status: "SUBMITTED",
    },
  });

  await writeAudit({
    action: "SUBMISSION",
    entityType: "Submission",
    entityId: created.id,
    metadata: { type: created.type },
    ipAddress: clientIp(req),
  });

  log.info("submission.created", { id: created.id });
  return jsonOk({ id: created.id, status: created.status }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;
  if (!canPublish(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as { id?: string; status?: string; reviewedNotes?: string };
  if (!body.id || !body.status) return jsonError("id and status required");

  const updated = await prisma.submission.update({
    where: { id: body.id },
    data: {
      status: body.status,
      reviewedNotes: body.reviewedNotes || null,
    },
  });

  if (body.status === "APPROVED" && updated.type === "location") {
    const payload = JSON.parse(updated.payloadJson) as Record<string, unknown>;
    if (payload.name && payload.latitude != null && payload.longitude != null) {
      const cat = await prisma.category.findFirst({
        where: payload.categorySlug ? { slug: String(payload.categorySlug) } : undefined,
      });
      const prov = await prisma.province.findFirst({
        where: payload.provinceSlug
          ? { OR: [{ slug: String(payload.provinceSlug) }, { code: String(payload.provinceSlug) }] }
          : { code: "NC" },
      });
      if (cat && prov) {
        const slugBase = String(payload.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 60);
        await prisma.location.create({
          data: {
            slug: `${slugBase}-${Date.now().toString(36)}`,
            name: String(payload.name),
            summary:
              String(payload.summary || "") ||
              "Community-submitted listing pending full verification.",
            latitude: Number(payload.latitude),
            longitude: Number(payload.longitude),
            categoryId: cat.id,
            provinceId: prov.id,
            opportunitiesJson: JSON.stringify(payload.opportunities || []),
            assetsJson: JSON.stringify(payload.assets || []),
            tagsJson: JSON.stringify(["community-submission"]),
            status: "PENDING_REVIEW",
            ownerId: auth.user.id,
            coordQuality: "unknown",
          },
        });
      }
    }
  }

  await writeAudit({
    userId: auth.user.id,
    action: body.status,
    entityType: "Submission",
    entityId: updated.id,
  });

  return jsonOk({ submission: updated });
}
