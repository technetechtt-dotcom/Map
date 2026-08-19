import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError, enforceRateLimitAsync } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { parseJsonArray } from "@/lib/shape";
import {
  assertOrganisationAccess,
  assertProvinceAccess,
  assertStatusChange,
  canEditDrafts,
  canPublish,
  coerceCreateStatus,
} from "@/lib/policy";
import { clientIp, readJsonLimited } from "@/lib/security";

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
  const limited = await enforceRateLimitAsync(req, "ecosystem-create", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as Record<string, unknown>;
  const type = String(body.type || "funding");
  const tagsJson = Array.isArray(body.tags) ? body.tags : [];

  if (!body.slug || !body.title || !body.summary) {
    return jsonError("slug, title, summary required");
  }

  const status = coerceCreateStatus(auth.user, body.status as string | undefined);
  const statusCheck = assertStatusChange(auth.user, status);
  if (!statusCheck.ok) return jsonError(statusCheck.reason, 403);

  const provinceId = (body.provinceId as string) || auth.user.provinceId || null;
  const organisationId =
    (body.organisationId as string) || auth.user.organisationId || null;

  const prov = assertProvinceAccess(auth.user, provinceId);
  if (!prov.ok) return jsonError(prov.reason, 403);
  if (organisationId) {
    const org = assertOrganisationAccess(auth.user, organisationId);
    if (!org.ok) return jsonError(org.reason, 403);
  }
  if ((body.status === "PUBLISHED" || status === "PUBLISHED") && !canPublish(auth.user)) {
    return jsonError("Only provincial or super administrators may publish ecosystem items", 403);
  }

  let created;
  if (type === "events") {
    created = await prisma.ecosystemEvent.create({
      data: {
        slug: String(body.slug),
        title: String(body.title),
        summary: String(body.summary),
        description: (body.description as string) || null,
        startsAt: new Date(String(body.startsAt)),
        endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
        venue: (body.venue as string) || null,
        onlineUrl: (body.onlineUrl as string) || null,
        latitude: body.latitude != null ? Number(body.latitude) : null,
        longitude: body.longitude != null ? Number(body.longitude) : null,
        status,
        provinceId,
        organisationId,
        tagsJson,
      },
    });
  } else if (type === "programmes") {
    created = await prisma.programme.create({
      data: {
        slug: String(body.slug),
        title: String(body.title),
        summary: String(body.summary),
        description: (body.description as string) || null,
        status,
        provinceId,
        organisationId,
        tagsJson,
        startDate: body.startDate ? new Date(String(body.startDate)) : null,
        endDate: body.endDate ? new Date(String(body.endDate)) : null,
      },
    });
  } else if (type === "procurement") {
    created = await prisma.procurement.create({
      data: {
        slug: String(body.slug),
        title: String(body.title),
        summary: String(body.summary),
        description: (body.description as string) || null,
        closingDate: body.closingDate ? new Date(String(body.closingDate)) : null,
        budget: (body.budget as string) || null,
        url: (body.url as string) || null,
        status,
        provinceId,
        organisationId,
        tagsJson,
      },
    });
  } else {
    created = await prisma.fundingCall.create({
      data: {
        slug: String(body.slug),
        title: String(body.title),
        summary: String(body.summary),
        description: (body.description as string) || null,
        amount: (body.amount as string) || null,
        deadline: body.deadline ? new Date(String(body.deadline)) : null,
        url: (body.url as string) || null,
        status,
        provinceId,
        organisationId,
        tagsJson,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });
  }

  await writeAudit({
    userId: auth.user.id,
    action: "CREATE",
    entityType: type,
    entityId: created.id,
    metadata: { status },
    provinceId,
    organisationId,
    ipAddress: clientIp(req),
  });
  return jsonOk({ item: created }, 201);
}
