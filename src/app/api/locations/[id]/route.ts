import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { shapeLocation } from "@/lib/shape";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { serializeArray } from "@/lib/shape";
import { writeAudit } from "@/lib/audit";
import { canEditContent, canManageProvince } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const loc = await prisma.location.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      category: true,
      province: true,
      district: true,
      municipality: true,
      organisation: true,
      sources: true,
    },
  });
  if (!loc) return jsonError("Not found", 404);
  return jsonOk({
    location: shapeLocation(loc),
    sources: loc.sources,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditContent(auth.user.role)) return jsonError("Forbidden", 403);

  const body = await req.json();
  const existing = await prisma.location.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
  });
  if (!existing) return jsonError("Not found", 404);

  if (
    auth.user.role === "PROVINCIAL_ADMIN" &&
    auth.user.provinceId &&
    existing.provinceId !== auth.user.provinceId
  ) {
    return jsonError("Outside your province", 403);
  }

  const data: Record<string, unknown> = {};
  const fields = [
    "name", "summary", "description", "latitude", "longitude", "website", "email",
    "phone", "address", "imageUrl", "status", "verificationNotes", "verificationSource",
    "categoryId", "districtId", "municipalityId", "provinceId", "organisationId",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (body.opportunities) data.opportunitiesJson = serializeArray(body.opportunities);
  if (body.assets) data.assetsJson = serializeArray(body.assets);
  if (body.tags) data.tagsJson = serializeArray(body.tags);
  if (body.status === "VERIFIED" || body.status === "PUBLISHED") {
    data.lastVerifiedAt = new Date();
    data.reviewedById = auth.user.id;
    if (body.status === "PUBLISHED") data.publishedAt = new Date();
  }

  const updated = await prisma.location.update({
    where: { id: existing.id },
    data,
    include: {
      category: true,
      province: true,
      district: true,
      municipality: true,
      organisation: true,
    },
  });

  await writeAudit({
    userId: auth.user.id,
    action: "UPDATE",
    entityType: "Location",
    entityId: updated.id,
    metadata: body,
  });

  return jsonOk({ location: shapeLocation(updated) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageProvince(auth.user.role)) return jsonError("Forbidden", 403);

  const existing = await prisma.location.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
  });
  if (!existing) return jsonError("Not found", 404);

  await prisma.location.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED" },
  });
  await writeAudit({
    userId: auth.user.id,
    action: "ARCHIVE",
    entityType: "Location",
    entityId: existing.id,
  });
  return jsonOk({ ok: true });
}
