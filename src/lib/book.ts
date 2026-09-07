import { prisma } from "@/lib/prisma";
import type { RecordStatus } from "@prisma/client";
import { parseJsonArray, shapeLocation } from "@/lib/shape";

const BOOK_CACHE_MS = 120_000;
type LoadedBook = Awaited<ReturnType<typeof loadBookData>>;
const globalForBook = globalThis as unknown as {
  bookCache?: Map<string, { expires: number; value: LoadedBook }>;
  bookInflight?: Map<string, Promise<LoadedBook>>;
};
const bookCache = globalForBook.bookCache ?? new Map<string, { expires: number; value: LoadedBook }>();
const bookInflight = globalForBook.bookInflight ?? new Map<string, Promise<LoadedBook>>();
globalForBook.bookCache = bookCache;
globalForBook.bookInflight = bookInflight;

export async function getBookData(provinceSlug?: string) {
  const key = provinceSlug || "all";
  const hit = bookCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const pending = bookInflight.get(key);
  if (pending) return pending;
  const load = loadBookData(provinceSlug)
    .then((value) => {
      bookCache.set(key, { expires: Date.now() + BOOK_CACHE_MS, value });
      return value;
    })
    .finally(() => bookInflight.delete(key));
  bookInflight.set(key, load);
  return load;
}

async function loadBookData(provinceSlug?: string) {
  const provinceWhere = provinceSlug
    ? { OR: [{ slug: provinceSlug }, { code: provinceSlug }, { name: provinceSlug }] }
    : undefined;

  const province = provinceSlug
    ? await prisma.province.findFirst({ where: provinceWhere })
    : null;

  const locationWhere = {
    status: { in: ["PUBLISHED", "VERIFIED"] as RecordStatus[] },
    ...(province ? { provinceId: province.id } : {}),
  };

  const scopeWhere = province ? { provinceId: province.id } : {};
  const publishedScope = { status: "PUBLISHED" as const, ...scopeWhere };

  // Peak 3 connections (fits Neon/dev pool of 5) instead of 9-way Promise.all.
  const [locations, categories, provinces] = await Promise.all([
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
  ]);
  const [districts, funding, events] = await Promise.all([
    prisma.district.findMany({
      where: province ? { provinceId: province.id } : undefined,
      include: { municipalities: true, province: true },
      orderBy: { name: "asc" },
    }),
    prisma.fundingCall.findMany({
      where: publishedScope,
      include: { organisation: true, province: true },
      orderBy: { title: "asc" },
    }),
    prisma.ecosystemEvent.findMany({
      where: publishedScope,
      include: { organisation: true, province: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const [programmes, procurements, orgs] = await Promise.all([
    prisma.programme.findMany({
      where: publishedScope,
      include: { organisation: true, province: true },
      orderBy: { title: "asc" },
    }),
    prisma.procurement.findMany({
      where: publishedScope,
      include: { organisation: true, province: true },
      orderBy: { title: "asc" },
    }),
    prisma.organisation.findMany({
      where: publishedScope,
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

  const accents = ["#C9B3E0", "#7A9EAD", "#B8A07A", "#8FBC8F", "#CD853F", "#6B8E9F"];
  const opportunityChapters = districts.map((d, idx) => {
    const chapterLocs = shaped.filter(
      (l) => l.district?.code === d.code || l.district?.name === d.name
    );
    const primary = chapterLocs[0];
    const districtOrgs = organisations.filter((o) => {
      if (o.latitude == null || o.longitude == null || !primary) return false;
      const dLat = Math.abs(primary.latitude - o.latitude);
      const dLng = Math.abs(primary.longitude - o.longitude) * Math.cos((o.latitude * Math.PI) / 180);
      return Math.hypot(dLat, dLng) <= 1.35;
    });
    let pinN = 0;
    const contactsOrdered = (districtOrgs.length ? districtOrgs : organisations.slice(0, 6)).map((o) => {
      const hasPin = o.latitude != null && o.longitude != null;
      if (hasPin) pinN += 1;
      return {
        ...o,
        trueLatitude: o.latitude,
        trueLongitude: o.longitude,
        pinProxy: false,
        pinNumber: hasPin ? pinN : (null as number | null),
      };
    });
    const categoryNotes = Array.from(
      new Set(chapterLocs.map((l) => l.category?.name).filter(Boolean))
    ).slice(0, 5);

    return {
      pdfPage: idx + 1,
      id: d.code || d.id,
      title: `${d.name} — live catalogue`,
      zoneLabel: d.province?.name ? `${d.name} · ${d.province.name}` : d.name,
      emoji: "●",
      accent: accents[idx % accents.length],
      districtCodes: d.code ? [d.code] : [],
      munCodes: (d.municipalities || []).map((m: { code?: string | null }) => m.code).filter(Boolean) as string[],
      locationSlugs: chapterLocs.map((l) => l.slug),
      contactSlugs: contactsOrdered.map((o) => o.slug),
      chips: categoryNotes.map((label) => ({ label: String(label), note: "From published sites" })),
      opportunities: chapterLocs.slice(0, 5).map((l) => l.name),
      strategic:
        chapterLocs.length > 0
          ? `${chapterLocs.length} published site(s) in ${d.name} from the shared ops catalogue.`
          : `No published sites in ${d.name} yet — add and publish them in Ops.`,
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
    sourceDocument: "Live catalogue (shared Neon DB via Ops)",
    province,
    provinces,
    categories,
    districts,
    locations: shaped,
    byDistrict: Array.from(byDistrict.entries()).sort(([a], [b]) => a.localeCompare(b)),
    categoryCounts: Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]),
    provinceCounts: Array.from(byProvince.entries()).sort((a, b) => b[1] - a[1]),
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
