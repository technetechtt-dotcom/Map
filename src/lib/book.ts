import { prisma } from "@/lib/prisma";
import { parseJsonArray, shapeLocation } from "@/lib/shape";
import { OPPORTUNITY_CHAPTERS } from "@/lib/opportunity-chapters";

export async function getBookData(provinceSlug?: string) {
  const provinceWhere = provinceSlug
    ? { OR: [{ slug: provinceSlug }, { code: provinceSlug }, { name: provinceSlug }] }
    : undefined;

  const province = provinceSlug
    ? await prisma.province.findFirst({ where: provinceWhere })
    : null;

  const locationWhere = {
    status: { in: ["PUBLISHED", "VERIFIED"] },
    ...(province ? { provinceId: province.id } : {}),
  };

  const [locations, categories, provinces, districts, funding, events, programmes, procurements, orgs] =
    await Promise.all([
      prisma.location.findMany({
        where: locationWhere,
        include: {
          category: true,
          province: true,
          district: true,
          municipality: true,
          organisation: true,
          sources: true,
        },
        orderBy: [{ province: { name: "asc" } }, { district: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.province.findMany({ orderBy: { name: "asc" } }),
      prisma.district.findMany({
        where: province ? { provinceId: province.id } : undefined,
        include: { municipalities: true, province: true },
        orderBy: { name: "asc" },
      }),
      prisma.fundingCall.findMany({
        where: {
          status: "PUBLISHED",
          ...(province ? { provinceId: province.id } : {}),
        },
        include: { organisation: true, province: true },
        orderBy: { title: "asc" },
      }),
      prisma.ecosystemEvent.findMany({
        where: {
          status: "PUBLISHED",
          ...(province ? { provinceId: province.id } : {}),
        },
        include: { organisation: true, province: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.programme.findMany({
        where: {
          status: "PUBLISHED",
          ...(province ? { provinceId: province.id } : {}),
        },
        include: { organisation: true, province: true },
        orderBy: { title: "asc" },
      }),
      prisma.procurement.findMany({
        where: {
          status: "PUBLISHED",
          ...(province ? { provinceId: province.id } : {}),
        },
        include: { organisation: true, province: true },
        orderBy: { title: "asc" },
      }),
      prisma.organisation.findMany({
        where: {
          status: "PUBLISHED",
          ...(province ? { provinceId: province.id } : {}),
        },
        include: { province: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const shaped = locations.map((loc) => ({
    ...shapeLocation(loc),
    sources: loc.sources.map((s) => ({
      title: s.title,
      url: s.url,
      documentRef: s.documentRef,
      notes: s.notes,
    })),
  }));

  const organisations = orgs.map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    type: o.type,
    description: o.description,
    website: o.website,
    email: o.email,
    phone: o.phone,
    sourcePage: o.sourcePage,
    latitude: o.latitude,
    longitude: o.longitude,
    address: o.address,
    hostTownSlug: o.hostTownSlug,
    coordQuality: o.coordQuality,
    locationSlugs: parseJsonArray(o.locationSlugsJson),
  }));

  const orgBySlug = Object.fromEntries(organisations.map((o) => [o.slug, o]));
  const locBySlug = Object.fromEntries(shaped.map((l) => [l.slug, l]));

  /** Max distance (° ≈ km) for treating an org lat/lng as “in this zone” */
  const ZONE_PIN_DEG = 1.35;

  /** PDF pages 3–7 chapters with resolved locations + contacts + pins */
  const opportunityChapters = OPPORTUNITY_CHAPTERS.map((ch) => {
    const chapterLocs = ch.locationSlugs.map((s) => locBySlug[s]).filter(Boolean);
    const primary = chapterLocs[0];

    let pinN = 0;
    const contactsOrdered = ch.contactSlugs
      .map((s) => orgBySlug[s])
      .filter(Boolean)
      .map((o) => {
        const trueLat = o.latitude;
        const trueLng = o.longitude;
        const nearZone =
          trueLat != null &&
          trueLng != null &&
          chapterLocs.some((l) => {
            const dLat = Math.abs(l.latitude - trueLat);
            const dLng = Math.abs(l.longitude - trueLng) * Math.cos((trueLat * Math.PI) / 180);
            return Math.hypot(dLat, dLng) <= ZONE_PIN_DEG;
          });

        // Every PDF key contact gets a numbered pin on the zone map:
        // true coords when in-zone; else host town (proxy) so the list is complete.
        let pinLat: number | null = null;
        let pinLng: number | null = null;
        let pinProxy = false;
        if (nearZone && trueLat != null && trueLng != null) {
          pinLat = trueLat;
          pinLng = trueLng;
        } else if (primary) {
          pinLat = primary.latitude;
          pinLng = primary.longitude;
          pinProxy = true;
        } else if (trueLat != null && trueLng != null) {
          pinLat = trueLat;
          pinLng = trueLng;
        }

        const hasPin = pinLat != null && pinLng != null;
        if (hasPin) pinN += 1;
        return {
          ...o,
          // Map placement (may be zone host for national / out-of-zone HQs)
          latitude: pinLat,
          longitude: pinLng,
          trueLatitude: trueLat,
          trueLongitude: trueLng,
          pinProxy,
          pinNumber: hasPin ? pinN : (null as number | null),
        };
      });

    return {
      ...ch,
      locations: chapterLocs,
      contacts: contactsOrdered,
      coordsLabel: primary
        ? `${Math.abs(primary.latitude).toFixed(4)}° S, ${primary.longitude.toFixed(4)}° E`
        : null,
    };
  });

  const byDistrict = new Map<string, typeof shaped>();
  for (const loc of shaped) {
    const key = loc.district?.name || "Unassigned district";
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key)!.push(loc);
  }

  const byCategory = new Map<string, number>();
  for (const loc of shaped) {
    byCategory.set(loc.category.name, (byCategory.get(loc.category.name) || 0) + 1);
  }

  const byProvince = new Map<string, number>();
  for (const loc of shaped) {
    byProvince.set(loc.province.name, (byProvince.get(loc.province.name) || 0) + 1);
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: province ? province.name : "All provinces",
    sourceDocument: "NC_ICT_Ecosystem_Presentation.pptx.pdf (mLab NC, Updated 2025)",
    province,
    provinces,
    categories,
    districts,
    locations: shaped,
    byDistrict: [...byDistrict.entries()].sort(([a], [b]) => a.localeCompare(b)),
    categoryCounts: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    provinceCounts: [...byProvince.entries()].sort((a, b) => b[1] - a[1]),
    funding: funding.map((f) => ({
      ...f,
      tags: parseJsonArray(f.tagsJson),
    })),
    events: events.map((e) => ({
      ...e,
      tags: parseJsonArray(e.tagsJson),
    })),
    programmes: programmes.map((p) => ({
      ...p,
      tags: parseJsonArray(p.tagsJson),
    })),
    procurements: procurements.map((p) => ({
      ...p,
      tags: parseJsonArray(p.tagsJson),
    })),
    organisations,
    opportunityChapters,
    stats: {
      locations: shaped.length,
      verified: shaped.filter((l) => l.lastVerifiedAt).length,
      districts: districts.length,
      categories: categories.length,
      funding: funding.length,
      events: events.length,
      programmes: programmes.length,
      procurements: procurements.length,
      organisations: orgs.length,
      opportunityChapters: opportunityChapters.length,
    },
  };
}

export type BookData = Awaited<ReturnType<typeof getBookData>>;
