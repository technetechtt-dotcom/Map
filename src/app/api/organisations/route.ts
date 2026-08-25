import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/shape";
import { layoutSpiralOffsets } from "@/lib/pin-layout";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { assertProvinceAccess, canPublish, canVerify, isOrgAdmin, isSuperAdmin } from "@/lib/policy";
import { clientIp, readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { memoizeAsync } from "@/lib/server-memo";
import { organisationVerificationStamp, verificationFilterWhere } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const memoPublicOrgs = memoizeAsync<Record<string, unknown>>("orgs-public", 120_000);

const TYPE_COLORS: Record<string, string> = {
  Education: "#0f766e",
  "Education / TVET": "#0d9488",
  "Education / Incubation": "#14b8a6",
  "Digital hub": "#0369a1",
  Training: "#1d4ed8",
  Government: "#b45309",
  "SMME support": "#c2410c",
  Funding: "#7c3aed",
  "Funding / R&D": "#6d28d9",
  "Research / Data": "#2563eb",
  Media: "#475569",
  default: "#334155",
};

export async function GET(req: NextRequest) {
  try {
    const location = req.nextUrl.searchParams.get("location") || "";
    const type = req.nextUrl.searchParams.get("type") || "";
    const mapMode = req.nextUrl.searchParams.get("map") === "1";
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const province = req.nextUrl.searchParams.get("province") || "";
    const manage = req.nextUrl.searchParams.get("scope") === "manage";
    const verification = req.nextUrl.searchParams.get("verification") || (req.nextUrl.searchParams.get("verified") === "1" ? "current" : "");
    const auth = manage ? await requireSession() : null;
    if (auth?.error) return auth.error;
    const actor = auth && "user" in auth ? auth.user : null;
    // Contributors do not have an organisation-management view.  In
    // particular, never turn a contributor's organisationId into a query
    // scope: doing so would expose every organisation record in that tenant
    // instead of the contributor's own records.
    const manageWhere = manage
      ? isSuperAdmin(actor)
        ? {}
        : actor?.role === "PROVINCIAL_ADMIN"
          ? { provinceId: actor.provinceId || "__none__" }
          : actor?.role === "ORG_ADMIN"
            ? { id: actor.organisationId || "__none__" }
            : { id: "__none__" }
      : { status: "PUBLISHED" as const };

    if (!manage) {
      const cached = memoPublicOrgs.peek(req.nextUrl.search || "all");
      if (cached) return NextResponse.json(cached);
    }

    const rows = await prisma.organisation.findMany({
      where: {
        ...manageWhere,
        ...(!manage ? verificationFilterWhere(verification) : {}),
        ...(province
          ? {
              province: {
                OR: [{ slug: province }, { code: province }, { name: province }],
              },
            }
          : {}),
      },
      include: {
        province: true,
        category: true,
        relationshipsFrom: {
          where: { status: "PUBLISHED" },
          include: { target: { select: { id: true, slug: true, name: true, type: true } } },
        },
        relationshipsTo: {
          where: { status: "PUBLISHED" },
          include: { source: { select: { id: true, slug: true, name: true, type: true } } },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    const towns = await prisma.location.findMany({
      where: {
        status: { in: ["PUBLISHED", "VERIFIED"] },
        ...(province
          ? {
              province: {
                OR: [{ slug: province }, { code: province }, { name: province }],
              },
            }
          : {}),
      },
      select: {
        slug: true,
        name: true,
        latitude: true,
        longitude: true,
        district: { select: { name: true } },
      },
    });

    const townBySlug = Object.fromEntries(towns.map((t) => [t.slug, t]));

    let organisations = rows.map((o) => {
      const locationSlugs = parseJsonArray(o.locationSlugsJson);
      const hostTown = o.hostTownSlug ? townBySlug[o.hostTownSlug] : null;
      return {
        id: o.id,
        slug: o.slug,
        name: o.name,
        type: o.type,
        description: o.description,
        website: o.website,
        email: o.email,
        phone: o.phone,
        sourcePage: o.sourcePage,
        verified: o.verified,
        status: o.status,
        lastVerifiedAt: o.lastVerifiedAt,
        verificationTier: o.verificationTier,
        verificationExpiresAt: o.verificationExpiresAt,
        province: o.province ? { name: o.province.name, slug: o.province.slug } : null,
        locationSlugs,
        latitude: o.latitude,
        longitude: o.longitude,
        address: o.address,
        hostTownSlug: o.hostTownSlug,
        hostTownName: hostTown?.name ?? null,
        coordQuality: o.coordQuality,
        coordSource: o.coordSource,
        category: o.category,
        services: parseJsonArray(o.servicesJson),
        skills: parseJsonArray(o.skillsJson),
        technologies: parseJsonArray(o.technologiesJson),
        certifications: parseJsonArray(o.certificationsJson),
        serviceAreas: parseJsonArray(o.serviceAreasJson),
        industrySectors: parseJsonArray(o.industrySectorsJson),
        portfolio: parseJsonArray(o.portfolioJson),
        companySize: o.companySize,
        cipcNumber: o.cipcNumber,
        beeLevel: o.beeLevel,
        relationships: [
          ...o.relationshipsFrom.map((r) => ({ id: r.id, type: r.type, direction: "outgoing", organisation: r.target })),
          ...o.relationshipsTo.map((r) => ({ id: r.id, type: r.type, direction: "incoming", organisation: r.source })),
        ],
        color: TYPE_COLORS[o.type] || TYPE_COLORS.default,
      };
    });

    if (location) {
      organisations = organisations.filter(
        (o) =>
          o.locationSlugs.includes(location) ||
          o.locationSlugs.includes("province") ||
          o.hostTownSlug === location
      );
      organisations.sort((a, b) => {
        const aExact =
          a.locationSlugs.includes(location) || a.hostTownSlug === location ? 0 : 1;
        const bExact =
          b.locationSlugs.includes(location) || b.hostTownSlug === location ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.name.localeCompare(b.name);
      });
    }

    if (type) {
      organisations = organisations.filter((o) =>
        o.type.toLowerCase().includes(type.toLowerCase())
      );
    }

    if (q) {
      organisations = organisations.filter((o) => {
        const hay = [o.name, o.type, o.description, o.email, o.phone, o.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    /** One map pin per org; near-duplicates are spiral-spidered for visibility. */
    type HubOut = {
      id: string;
      organisationId: string;
      slug: string;
      name: string;
      type: string;
      description: string | null;
      website: string | null;
      email: string | null;
      phone: string | null;
      sourcePage: string | null;
      address: string | null;
      coordQuality: string | null;
      color: string;
      latitude: number;
      longitude: number;
      trueLatitude: number;
      trueLongitude: number;
      wasSpread: boolean;
      hostTown: string | null;
      hostTownName: string | null;
      verificationTier: string;
      lastVerifiedAt: Date | string | null;
      verificationExpiresAt: Date | string | null;
      verified: boolean;
      kind: "hub";
    };

    let hubs: HubOut[] = [];

    if (mapMode || req.nextUrl.searchParams.get("includeCoords") === "1") {
      const raw = organisations
        .filter(
          (o) =>
            o.latitude != null &&
            o.longitude != null &&
            Number.isFinite(o.latitude) &&
            Number.isFinite(o.longitude)
        )
        .map((o) => {
          const host = o.hostTownSlug ? townBySlug[o.hostTownSlug] : null;
          return {
            organisationId: o.id,
            slug: o.slug,
            name: o.name,
            type: o.type,
            description: o.description,
            website: o.website,
            email: o.email,
            phone: o.phone,
            sourcePage: o.sourcePage,
            address: o.address,
            coordQuality: o.coordQuality,
            color: o.color,
            latitude: o.latitude as number,
            longitude: o.longitude as number,
            hostTown: o.hostTownSlug,
            hostTownName: host?.name ?? o.hostTownName,
            verificationTier: o.verificationTier || "unverified",
            lastVerifiedAt: o.lastVerifiedAt,
            verificationExpiresAt: o.verificationExpiresAt,
            verified: o.verified,
          };
        });

      // Wider spiral for dense Kimberley CBD (~0.5–1.2 km fan)
      const laid = layoutSpiralOffsets(raw, { radiusDeg: 0.006, precision: 3 });

      hubs = laid.map((h) => ({
        id: `hub-${h.organisationId}`,
        organisationId: h.organisationId,
        slug: h.slug,
        name: h.name,
        type: h.type,
        description: h.description,
        website: h.website,
        email: h.email,
        phone: h.phone,
        sourcePage: h.sourcePage,
        address: h.address,
        coordQuality: h.coordQuality,
        color: h.color,
        latitude: h.displayLat,
        longitude: h.displayLng,
        trueLatitude: h.latitude,
        trueLongitude: h.longitude,
        wasSpread: h.wasSpread,
        hostTown: h.hostTown,
        hostTownName: h.hostTownName,
        verificationTier: h.verificationTier,
        lastVerifiedAt: h.lastVerifiedAt,
        verificationExpiresAt: h.verificationExpiresAt,
        verified: h.verified,
        kind: "hub" as const,
      }));
    }

    const types = Array.from(new Set(rows.map((o) => o.type))).sort();

    const payload = {
      count: organisations.length,
      types,
      organisations,
      hubs: mapMode || req.nextUrl.searchParams.get("includeCoords") === "1" ? hubs : undefined,
      hubCount: hubs.length || undefined,
    };
    if (!manage) memoPublicOrgs.store(req.nextUrl.search || "all", payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[api/organisations]", error);
    return NextResponse.json(
      {
        error: "Failed to load organisations",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  // Organisation administrators may edit their existing tenant record, but
  // cannot create additional organisations or choose a second tenant.
  if (!canVerify(auth.user)) return jsonError("Only provincial or super administrators may create organisations", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as Record<string, unknown>;
  if (!body.name || !body.slug || !body.type) return jsonError("name, slug and type required");
  const provinceId = String(body.provinceId || auth.user.provinceId || "") || null;
  const access = assertProvinceAccess(auth.user, provinceId);
  if (!access.ok) return jsonError(access.reason, 403);
  const requestedStatus = String(body.status || "DRAFT");
  const status = requestedStatus === "PUBLISHED" && canPublish(auth.user) ? "PUBLISHED" : "DRAFT";
  const organisation = await prisma.organisation.create({
    data: {
      name: String(body.name), slug: String(body.slug), type: String(body.type),
      description: body.description ? String(body.description) : null,
      website: body.website ? String(body.website) : null,
      email: body.email ? String(body.email) : null,
      phone: body.phone ? String(body.phone) : null,
      provinceId, status,
      servicesJson: Array.isArray(body.services) ? body.services : [],
      skillsJson: Array.isArray(body.skills) ? body.skills : [],
      technologiesJson: Array.isArray(body.technologies) ? body.technologies : [],
      certificationsJson: Array.isArray(body.certifications) ? body.certifications : [],
      serviceAreasJson: Array.isArray(body.serviceAreas) ? body.serviceAreas : [],
      industrySectorsJson: Array.isArray(body.industrySectors) ? body.industrySectors : [],
      companySize: body.companySize ? String(body.companySize) : null,
      cipcNumber: body.cipcNumber ? String(body.cipcNumber) : null,
      beeLevel: body.beeLevel ? String(body.beeLevel) : null,
    },
  });
  await writeAudit({ user: auth.user, action: "CREATE_ORGANISATION", entityType: "Organisation", entityId: organisation.id, metadata: { status }, ipAddress: clientIp(req) });
  return jsonOk({ organisation }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as Record<string, unknown>;
  const id = String(body.id || "");
  if (!id) return jsonError("id required");
  const current = await prisma.organisation.findUnique({ where: { id } });
  if (!current) return jsonError("Not found", 404);
  if (!isSuperAdmin(auth.user) && auth.user.role === "PROVINCIAL_ADMIN" && current.provinceId !== auth.user.provinceId) return jsonError("Outside your province scope", 403);
  if (isOrgAdmin(auth.user) && current.id !== auth.user.organisationId) return jsonError("Outside your organisation scope", 403);
  if (!canVerify(auth.user) && !isOrgAdmin(auth.user)) return jsonError("Forbidden", 403);
  if (body.status !== undefined && !["DRAFT", "PENDING_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"].includes(String(body.status))) {
    return jsonError("Invalid organisation status", 400);
  }
  if (
    (body.status === "VERIFIED" || body.status === "PUBLISHED" || body.status === "ARCHIVED") &&
    !canVerify(auth.user)
  ) {
    return jsonError("Only provincial or super administrators may verify, publish or archive", 403);
  }
  const allowed = ["name", "type", "description", "website", "email", "phone", "companySize", "cipcNumber", "beeLevel", "status"] as const;
  const data: Record<string, unknown> = {};
  for (const key of allowed) if (body[key] !== undefined) data[key] = body[key];
  for (const [input, column] of [["services", "servicesJson"], ["skills", "skillsJson"], ["technologies", "technologiesJson"], ["certifications", "certificationsJson"], ["serviceAreas", "serviceAreasJson"], ["industrySectors", "industrySectorsJson"], ["portfolio", "portfolioJson"]] as const) {
    if (Array.isArray(body[input])) data[column] = body[input];
  }
  if (canVerify(auth.user) && (body.status === "VERIFIED" || body.status === "PUBLISHED")) {
    Object.assign(
      data,
      organisationVerificationStamp({
        tier:
          body.verificationTier === "field" || body.verificationTier === "desktop"
            ? body.verificationTier
            : undefined,
        existingTier: current.verificationTier,
        source: typeof body.verificationSource === "string" ? body.verificationSource : current.verificationSource,
      })
    );
  } else if (body.verificationTier === "desktop" || body.verificationTier === "field" || body.verificationTier === "directory" || body.verificationTier === "unverified") {
    data.verificationTier = body.verificationTier;
  }
  const organisation = await prisma.organisation.update({ where: { id }, data });
  await writeAudit({ user: auth.user, action: "UPDATE_ORGANISATION", entityType: "Organisation", entityId: id, metadata: { fields: Object.keys(data) }, provinceId: current.provinceId, ipAddress: clientIp(req) });
  return jsonOk({ organisation });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canVerify(auth.user)) return jsonError("Forbidden", 403);
  const id = req.nextUrl.searchParams.get("id") || "";
  const current = await prisma.organisation.findUnique({ where: { id } });
  if (!current) return jsonError("Not found", 404);
  const access = assertProvinceAccess(auth.user, current.provinceId);
  if (!access.ok) return jsonError(access.reason, 403);
  const organisation = await prisma.organisation.update({ where: { id }, data: { status: "ARCHIVED" } });
  await writeAudit({ user: auth.user, action: "ARCHIVE_ORGANISATION", entityType: "Organisation", entityId: id, provinceId: current.provinceId, ipAddress: clientIp(req) });
  return jsonOk({ organisation });
}
