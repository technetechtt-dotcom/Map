import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canEditContent } from "@/lib/auth";
import { serializeArray, shapeLocation } from "@/lib/shape";
import { writeAudit } from "@/lib/audit";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditContent(auth.user.role)) return jsonError("Forbidden", 403);

  const body = await req.json();
  if (!body.name || !body.summary || body.latitude == null || body.longitude == null) {
    return jsonError("name, summary, latitude, longitude are required");
  }

  let categoryId = body.categoryId;
  if (!categoryId && body.categorySlug) {
    const cat = await prisma.category.findUnique({ where: { slug: body.categorySlug } });
    categoryId = cat?.id;
  }
  if (!categoryId) {
    const first = await prisma.category.findFirst();
    categoryId = first?.id;
  }

  let provinceId = body.provinceId || auth.user.provinceId;
  if (!provinceId && body.provinceSlug) {
    const p = await prisma.province.findFirst({
      where: { OR: [{ slug: body.provinceSlug }, { code: body.provinceSlug }] },
    });
    provinceId = p?.id;
  }
  if (!provinceId) {
    const nc = await prisma.province.findFirst({ where: { code: "NC" } });
    provinceId = nc?.id;
  }

  const baseSlug = body.slug || slugify(body.name);
  let slug = baseSlug;
  let i = 1;
  while (await prisma.location.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${i++}`;
  }

  const created = await prisma.location.create({
    data: {
      slug,
      name: body.name,
      summary: body.summary,
      description: body.description || null,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      categoryId,
      provinceId,
      districtId: body.districtId || null,
      municipalityId: body.municipalityId || null,
      opportunitiesJson: serializeArray(body.opportunities || []),
      assetsJson: serializeArray(body.assets || []),
      tagsJson: serializeArray(body.tags || []),
      website: body.website || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      imageUrl: body.imageUrl || null,
      status: body.status || "DRAFT",
      ownerId: auth.user.id,
      organisationId: body.organisationId || auth.user.organisationId || null,
      verificationSource: body.verificationSource || null,
    },
    include: {
      category: true,
      province: true,
      district: true,
      municipality: true,
      organisation: true,
    },
  });

  if (body.sourceTitle) {
    await prisma.sourceRecord.create({
      data: {
        locationId: created.id,
        title: body.sourceTitle,
        url: body.sourceUrl || null,
        documentRef: body.documentRef || null,
        notes: body.sourceNotes || null,
        capturedById: auth.user.id,
      },
    });
  }

  await writeAudit({
    userId: auth.user.id,
    action: "CREATE",
    entityType: "Location",
    entityId: created.id,
    metadata: { name: created.name },
  });

  return jsonOk({ location: shapeLocation(created) }, 201);
}
