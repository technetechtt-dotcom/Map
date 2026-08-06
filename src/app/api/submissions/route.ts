import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN"]);
  if (auth.error) return auth.error;

  const rows = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return jsonOk({
    submissions: rows.map((s) => ({
      ...s,
      payload: JSON.parse(s.payloadJson),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.submitterName || !body.submitterEmail || !body.payload) {
    return jsonError("submitterName, submitterEmail and payload required");
  }

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
    metadata: { type: created.type, email: body.submitterEmail },
  });

  return jsonOk({ id: created.id, status: created.status }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;
  const body = await req.json();
  if (!body.id || !body.status) return jsonError("id and status required");

  const updated = await prisma.submission.update({
    where: { id: body.id },
    data: {
      status: body.status,
      reviewedNotes: body.reviewedNotes || null,
    },
  });

  // Auto-promote approved location submissions to draft locations
  if (body.status === "APPROVED" && updated.type === "location") {
    const payload = JSON.parse(updated.payloadJson);
    if (payload.name && payload.latitude != null && payload.longitude != null) {
      const cat = await prisma.category.findFirst({
        where: payload.categorySlug ? { slug: payload.categorySlug } : undefined,
      });
      const prov = await prisma.province.findFirst({
        where: payload.provinceSlug
          ? { OR: [{ slug: payload.provinceSlug }, { code: payload.provinceSlug }] }
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
            name: payload.name,
            summary: payload.summary || "Community-submitted listing pending full verification.",
            latitude: Number(payload.latitude),
            longitude: Number(payload.longitude),
            categoryId: cat.id,
            provinceId: prov.id,
            opportunitiesJson: JSON.stringify(payload.opportunities || []),
            assetsJson: JSON.stringify(payload.assets || []),
            tagsJson: JSON.stringify(["community-submission"]),
            status: "PENDING_REVIEW",
            ownerId: auth.user.id,
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
