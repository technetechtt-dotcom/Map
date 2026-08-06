import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { parseJsonArray } from "@/lib/shape";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "funding";
  const province = req.nextUrl.searchParams.get("province") || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provinceFilter: any = province
    ? { province: { OR: [{ slug: province }, { code: province }, { name: province }] } }
    : {};

  if (type === "events") {
    const rows = await prisma.ecosystemEvent.findMany({
      where: { status: "PUBLISHED", ...provinceFilter },
      include: { province: true, organisation: true },
      orderBy: { startsAt: "asc" },
    });
    return jsonOk({
      items: rows.map((r) => ({
        ...r,
        tags: parseJsonArray(r.tagsJson),
      })),
    });
  }

  if (type === "programmes") {
    const rows = await prisma.programme.findMany({
      where: { status: "PUBLISHED", ...provinceFilter },
      include: { province: true, organisation: true },
      orderBy: { title: "asc" },
    });
    return jsonOk({
      items: rows.map((r) => ({ ...r, tags: parseJsonArray(r.tagsJson) })),
    });
  }

  if (type === "procurement") {
    const rows = await prisma.procurement.findMany({
      where: { status: "PUBLISHED", ...provinceFilter },
      include: { province: true, organisation: true },
      orderBy: { closingDate: "asc" },
    });
    return jsonOk({
      items: rows.map((r) => ({ ...r, tags: parseJsonArray(r.tagsJson) })),
    });
  }

  const rows = await prisma.fundingCall.findMany({
    where: { status: "PUBLISHED", ...provinceFilter },
    include: { province: true, organisation: true },
    orderBy: { deadline: "asc" },
  });
  return jsonOk({
    items: rows.map((r) => ({ ...r, tags: parseJsonArray(r.tagsJson) })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN"]);
  if (auth.error) return auth.error;
  const body = await req.json();
  const type = body.type || "funding";
  const tagsJson = JSON.stringify(body.tags || []);

  let created;
  if (type === "events") {
    created = await prisma.ecosystemEvent.create({
      data: {
        slug: body.slug,
        title: body.title,
        summary: body.summary,
        description: body.description,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        venue: body.venue,
        onlineUrl: body.onlineUrl,
        latitude: body.latitude,
        longitude: body.longitude,
        status: body.status || "DRAFT",
        provinceId: body.provinceId || auth.user.provinceId,
        organisationId: body.organisationId || auth.user.organisationId,
        tagsJson,
      },
    });
  } else if (type === "programmes") {
    created = await prisma.programme.create({
      data: {
        slug: body.slug,
        title: body.title,
        summary: body.summary,
        description: body.description,
        status: body.status || "DRAFT",
        provinceId: body.provinceId || auth.user.provinceId,
        organisationId: body.organisationId || auth.user.organisationId,
        tagsJson,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
    });
  } else if (type === "procurement") {
    created = await prisma.procurement.create({
      data: {
        slug: body.slug,
        title: body.title,
        summary: body.summary,
        description: body.description,
        closingDate: body.closingDate ? new Date(body.closingDate) : null,
        budget: body.budget,
        url: body.url,
        status: body.status || "DRAFT",
        provinceId: body.provinceId || auth.user.provinceId,
        organisationId: body.organisationId || auth.user.organisationId,
        tagsJson,
      },
    });
  } else {
    created = await prisma.fundingCall.create({
      data: {
        slug: body.slug,
        title: body.title,
        summary: body.summary,
        description: body.description,
        amount: body.amount,
        deadline: body.deadline ? new Date(body.deadline) : null,
        url: body.url,
        status: body.status || "DRAFT",
        provinceId: body.provinceId || auth.user.provinceId,
        organisationId: body.organisationId || auth.user.organisationId,
        tagsJson,
        publishedAt: body.status === "PUBLISHED" ? new Date() : null,
      },
    });
  }

  await writeAudit({
    userId: auth.user.id,
    action: "CREATE",
    entityType: type,
    entityId: created.id,
  });
  return jsonOk({ item: created }, 201);
}
