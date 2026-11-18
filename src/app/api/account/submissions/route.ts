import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { readJsonLimited, clientIp } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["resubmit", "withdraw"]),
  additionalInfo: z.string().trim().max(4000).optional(),
});

function key(type: string | null | undefined, id: string | null | undefined) {
  return type && id ? `${type}:${id}` : "";
}

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const accountEmail = auth.user.email?.trim().toLowerCase();
  if (!accountEmail) return jsonError("Account email is required", 400);

  const rows = await prisma.submission.findMany({
    where: {
      OR: [
        { submittedById: auth.user.id },
        { submittedById: null, submitterEmail: accountEmail },
      ],
    },
    include: { province: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const locationIds = rows.map((r) => r.createdLocationId).filter((id): id is string => Boolean(id));
  const entityIds = (type: string) =>
    rows.filter((r) => r.createdEntityType === type && r.createdEntityId).map((r) => r.createdEntityId as string);

  const [locations, organisations, funding, events, programmes, procurement] = await Promise.all([
    locationIds.length ? prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, slug: true } }) : [],
    entityIds("organisation").length ? prisma.organisation.findMany({ where: { id: { in: entityIds("organisation") } }, select: { id: true, slug: true } }) : [],
    entityIds("funding").length ? prisma.fundingCall.findMany({ where: { id: { in: entityIds("funding") } }, select: { id: true, slug: true } }) : [],
    entityIds("events").length ? prisma.ecosystemEvent.findMany({ where: { id: { in: entityIds("events") } }, select: { id: true, slug: true } }) : [],
    entityIds("programmes").length ? prisma.programme.findMany({ where: { id: { in: entityIds("programmes") } }, select: { id: true, slug: true } }) : [],
    entityIds("procurement").length ? prisma.procurement.findMany({ where: { id: { in: entityIds("procurement") } }, select: { id: true, slug: true } }) : [],
  ]);

  const published = new Map<string, string>();
  locations.forEach((r) => published.set(key("location", r.id), `/locations/${r.slug}`));
  organisations.forEach((r) => published.set(key("organisation", r.id), `/org/${r.slug}`));
  funding.forEach((r) => published.set(key("funding", r.id), `/funding/${r.slug}`));
  events.forEach((r) => published.set(key("events", r.id), `/events/${r.slug}`));
  programmes.forEach((r) => published.set(key("programmes", r.id), `/programmes/${r.slug}`));
  procurement.forEach((r) => published.set(key("procurement", r.id), `/procurement/${r.slug}`));

  return jsonOk({
    submissions: rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      trackingRef: row.trackingRef,
      payload: row.payloadJson,
      notes: row.notes,
      reviewedNotes: row.reviewedNotes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      province: row.province,
      publishedUrl:
        published.get(key(row.createdEntityType, row.createdEntityId)) ||
        published.get(key("location", row.createdLocationId)) ||
        null,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const accountEmail = auth.user.email?.trim().toLowerCase();
  if (!accountEmail) return jsonError("Account email is required", 400);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = actionSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });

  const existing = await prisma.submission.findFirst({
    where: {
      id: body.data.id,
      OR: [
        { submittedById: auth.user.id },
        { submittedById: null, submitterEmail: accountEmail },
      ],
    },
  });
  if (!existing) return jsonError("Submission not found", 404);

  if (body.data.action === "withdraw") {
    if (["PUBLISHED", "APPROVED", "REJECTED", "WITHDRAWN"].includes(existing.status)) {
      return jsonError("This submission can no longer be withdrawn", 409);
    }
    const updated = await prisma.submission.update({
      where: { id: existing.id },
      data: { status: "WITHDRAWN" },
    });
    await writeAudit({
      user: auth.user,
      userId: auth.user.id,
      action: "SUBMISSION_WITHDRAWN",
      entityType: "Submission",
      entityId: existing.id,
      provinceId: existing.provinceId,
      ipAddress: clientIp(req),
    });
    return jsonOk({ submission: updated });
  }

  if (existing.status !== "NEEDS_INFORMATION") {
    return jsonError("Only submissions awaiting information can be resubmitted", 409);
  }
  const additionalInfo = (body.data.additionalInfo || "").trim();
  if (additionalInfo.length < 3) return jsonError("Please provide the requested information", 400);
  const marker = `[Stakeholder response ${new Date().toISOString()}] ${additionalInfo}`;
  const updated = await prisma.submission.update({
    where: { id: existing.id },
    data: {
      status: "SUBMITTED",
      submittedById: auth.user.id,
      notes: [existing.notes, marker].filter(Boolean).join("\n\n"),
    },
  });
  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "SUBMISSION_RESUBMITTED",
    entityType: "Submission",
    entityId: existing.id,
    provinceId: existing.provinceId,
    metadata: { trackingRef: existing.trackingRef },
    ipAddress: clientIp(req),
  });
  await notify({
    type: "submission.update",
    to: accountEmail,
    userId: auth.user.id,
    subject: `Submission ${existing.trackingRef || existing.id} resubmitted`,
    body: "Your additional information has been sent back to the review queue.",
  });
  return jsonOk({ submission: updated });
}
