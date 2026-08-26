const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { categories, locations } = require("../data/seed/nc-locations");
const { organisations: pdfOrganisations } = require("../data/seed/pdf-organisations");
const { sourceVersion: nationalSourceVersion, retrievedAt: nationalRetrievedAt, records: nationalDirectory } = require("../data/seed/national-directory");
const {
  publicTitle,
  dataSource,
  ncReviewedAt,
  ncExpiresAt,
  ncSourceVersion,
  ncVerificationNotes,
} = require("../data/seed/presentation");
const orgCoordinates = require("../data/seed/org-coordinates");
const {
  ncDistricts,
  ncMunicipalities,
  provincesCenters,
  nationalBoundaries,
} = require("../data/seed/boundaries");

function canonicalEntityKey(provinceSlug, name, latitude, longitude) {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return `${provinceSlug}|${slug}|${Number(latitude).toFixed(3)}|${Number(longitude).toFixed(3)}`;
}
function loadMdbPack() {
  try {
    const p = path.join(__dirname, "..", "data", "boundaries", "mdb", "nc_mdb_book.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function mdbDistrictFeature(mdb, code) {
  const sheet = mdb?.districts?.[code];
  if (!sheet?.geometry) return null;
  return {
    type: "Feature",
    properties: { name: sheet.name, code: sheet.code, fill: sheet.color },
    geometry: sheet.geometry,
  };
}

function mdbMunicipalityFeature(mdb, districtCode, munName, munCode) {
  const sheet = mdb?.districts?.[districtCode];
  if (!sheet) return null;
  const m = (sheet.municipalities || []).find(
    (x) => String(x.name).toLowerCase() === String(munName).toLowerCase()
  );
  if (!m?.geometry) return null;
  return {
    type: "Feature",
    properties: {
      name: m.name,
      code: munCode,
      fill: m.fill || sheet.color,
      district: sheet.name,
      districtCode,
    },
    geometry: m.geometry,
  };
}

const mdbPack = loadMdbPack();
if (mdbPack) {
  console.log("Seed: using MDB boundary pack for NC districts/municipalities (matches book).");
}

const prisma = new PrismaClient();

const NC_DISTRICTS = [
  { code: "DC9", name: "Frances Baard", nameAf: "Frances Baard", muns: [
    { code: "NC091", name: "Sol Plaatje" },
    { code: "NC092", name: "Dikgatlong" },
    { code: "NC093", name: "Magareng" },
    { code: "NC094", name: "Phokwane" },
  ]},
  { code: "DC45", name: "John Taolo Gaetsewe", nameAf: "John Taolo Gaetsewe", muns: [
    { code: "NC451", name: "Joe Morolong" },
    { code: "NC452", name: "Ga-Segonyana" },
    { code: "NC453", name: "Gamagara" },
  ]},
  { code: "DC8", name: "ZF Mgcawu", nameAf: "ZF Mgcawu", muns: [
    { code: "NC082", name: "Kai !Garib" },
    { code: "NC083", name: "!Kheis" },
    { code: "NC084", name: "Kgatelopele" },
    { code: "NC085", name: "Tsantsabane" },
    { code: "NC086", name: "Dawid Kruiper" },
    { code: "NC087", name: "Dawid Kruiper (remote)" },
  ]},
  { code: "DC7", name: "Pixley ka Seme", nameAf: "Pixley ka Seme", muns: [
    { code: "NC071", name: "Siyancuma" },
    { code: "NC072", name: "Thembelihle" },
    { code: "NC073", name: "Emthanjeni" },
    { code: "NC074", name: "Kareeberg" },
    { code: "NC075", name: "Umsobomvu" },
    { code: "NC076", name: "Renosterberg" },
    { code: "NC077", name: "Siyathemba" },
    { code: "NC078", name: "Ubuntu" },
  ]},
  { code: "DC6", name: "Namakwa", nameAf: "Namakwa", muns: [
    { code: "NC061", name: "Richtersveld" },
    { code: "NC062", name: "Nama Khoi" },
    { code: "NC064", name: "Kamiesberg" },
    { code: "NC065", name: "Hantam" },
    { code: "NC066", name: "Karoo Hoogland" },
    { code: "NC067", name: "Khai-Ma" },
  ]},
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  console.log("Seeding SA ICT Ecosystem platform...");

  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.ALLOW_DATABASE_RESET !== "1") {
    throw new Error(
      "Destructive seed blocked in production. Set ALLOW_DATABASE_RESET=1 only after explicit approval, or use non-destructive import scripts."
    );
  }
  if (!isProd && process.env.ALLOW_DATABASE_RESET === "0") {
    throw new Error("Seed blocked: ALLOW_DATABASE_RESET=0");
  }
  if (isProd) {
    console.warn("WARNING: wiping all application data (ALLOW_DATABASE_RESET=1).");
  }

  await prisma.importBatch.deleteMany().catch(() => undefined);
  await prisma.passwordHistory.deleteMany().catch(() => undefined);
  await prisma.analyticsEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.sourceRecord.deleteMany();
  await prisma.backupRecord.deleteMany();
  await prisma.fundingCall.deleteMany();
  await prisma.ecosystemEvent.deleteMany();
  await prisma.programme.deleteMany();
  await prisma.procurement.deleteMany();
  await prisma.location.deleteMany();
  await prisma.category.deleteMany();
  await prisma.municipality.deleteMany();
  await prisma.district.deleteMany();
  await prisma.passwordResetToken.deleteMany().catch(() => undefined);
  await prisma.adminInvitation.deleteMany().catch(() => undefined);
  await prisma.storedObject.deleteMany().catch(() => undefined);
  await prisma.dataSubjectRequest.deleteMany().catch(() => undefined);
  await prisma.correctionRequest.deleteMany().catch(() => undefined);
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.province.deleteMany();
  await prisma.appSetting.deleteMany();

  const provinceMap = {};
  for (const [code, name, nameAf, nameXh, nameZu, slug, lat, lng, zoom] of provincesCenters) {
    const feature = nationalBoundaries.features.find((f) => f.properties.code === code);
    const p = await prisma.province.create({
      data: {
        code,
        name,
        nameAf,
        nameXh,
        nameZu,
        slug,
        centerLat: lat,
        centerLng: lng,
        defaultZoom: zoom,
        geojson: feature || null,
      },
    });
    provinceMap[code] = p;
  }

  const nc = provinceMap.NC;
  const districtMap = {};
  const munMap = {};

  for (const d of NC_DISTRICTS) {
    const feat =
      mdbDistrictFeature(mdbPack, d.code) ||
      ncDistricts.features.find((f) => f.properties.code === d.code);
    // ensure fill colour from MDB palette on feature props
    if (feat?.properties && mdbPack?.districts?.[d.code]?.color) {
      feat.properties.fill = mdbPack.districts[d.code].color;
    }
    const district = await prisma.district.create({
      data: {
        code: d.code,
        name: d.name,
        nameAf: d.nameAf,
        provinceId: nc.id,
        geojson: feat || null,
      },
    });
    districtMap[d.code] = district;
    for (const m of d.muns) {
      const mfeat =
        mdbMunicipalityFeature(mdbPack, d.code, m.name, m.code) ||
        ncMunicipalities.features.find((f) => f.properties.code === m.code);
      if (mfeat?.properties && !mfeat.properties.fill && feat?.properties?.fill) {
        mfeat.properties.fill = feat.properties.fill;
      }
      const mun = await prisma.municipality.create({
        data: {
          code: m.code,
          name: m.name,
          districtId: district.id,
          geojson: mfeat || null,
        },
      });
      munMap[m.code] = mun;
    }
  }

  const catMap = {};
  for (const c of categories) {
    catMap[c.slug] = await prisma.category.create({ data: c });
  }

  const passwordFromEnv = (process.env.SEED_ADMIN_PASSWORD || "").trim();
  const allowDemo =
    process.env.ALLOW_DEMO_USERS === "1" && process.env.NODE_ENV !== "production";
  const demoPassword = allowDemo ? passwordFromEnv || "ChangeMe-LocalOnly-123!" : "";
  const adminPassword = passwordFromEnv || demoPassword;

  let superAdmin = null;
  let ncAdmin = null;
  let orgAdminCreated = false;

  if (adminPassword) {
    if (adminPassword.length < 12) {
      throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    superAdmin = await prisma.user.create({
      data: {
        email: (process.env.SEED_ADMIN_EMAIL || "admin@ictmap.gov.za").toLowerCase(),
        name: "National Super Admin",
        passwordHash,
        role: "SUPER_ADMIN",
        locale: "en",
      },
    });

    ncAdmin = await prisma.user.create({
      data: {
        email: (process.env.SEED_NC_ADMIN_EMAIL || "nc.admin@ictmap.gov.za").toLowerCase(),
        name: "Northern Cape Admin",
        passwordHash,
        role: "PROVINCIAL_ADMIN",
        provinceId: nc.id,
        locale: "en",
      },
    });
  } else {
    console.warn(
      "[seed] No admin users created. Set SEED_ADMIN_PASSWORD (min 12 chars), or ALLOW_DEMO_USERS=1 for non-production demo."
    );
  }

  const orgMap = {};
  let orgCoordsCount = 0;
  for (const o of pdfOrganisations) {
    const geo = orgCoordinates[o.slug] || {};
    const mapOff = geo.map === false;
    const latitude = mapOff ? null : geo.latitude ?? null;
    const longitude = mapOff ? null : geo.longitude ?? null;
    if (latitude != null && longitude != null) orgCoordsCount += 1;
    const created = await prisma.organisation.create({
      data: {
        slug: o.slug,
        name: o.name,
        type: o.type,
        description: o.description || null,
        website: o.website || null,
        email: o.email || null,
        phone: o.phone || null,
        locationSlugsJson: o.locationSlugs || ["province"],
        sourcePage: o.sourcePage || null,
        latitude,
        longitude,
        address: geo.address || null,
        hostTownSlug: geo.hostTown || (o.locationSlugs || []).find((s) => s !== "province") || null,
        coordQuality: geo.quality || (mapOff ? "directory-only" : null),
        coordSource: geo.source || null,
        provinceId: nc.id,
        verified: true,
        status: "PUBLISHED",
      },
    });
    orgMap[o.slug] = created;
  }

  const org = orgMap["mlab-northern-cape"];

  if (adminPassword && ncAdmin && org) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: (process.env.SEED_ORG_ADMIN_EMAIL || "org@dedat.example").toLowerCase(),
        name: "DEDaT Org Admin",
        passwordHash,
        role: "ORG_ADMIN",
        provinceId: nc.id,
        organisationId: org.id,
      },
    });
    orgAdminCreated = true;
  }

  let verifiedCount = 0;
  for (const row of locations) {
    const [slug, name, dCode, mCode, lat, lng, catSlug, summary, opps, assets, status, verified, sourceRef, description] = row;
    const district = districtMap[dCode];
    const municipality = munMap[mCode];
    if (!district) {
      console.warn("Missing district", dCode, slug);
      continue;
    }

    // Primary linked org: first matching org that lists this location slug (prefer digital hub / government anchors)
    const linked = pdfOrganisations.find((o) => (o.locationSlugs || []).includes(slug));
    const primaryOrgId = linked ? orgMap[linked.slug]?.id : org.id;

    const loc = await prisma.location.create({
      data: {
        slug,
        name,
        summary,
        description: description || summary,
        latitude: lat,
        longitude: lng,
        categoryId: catMap[catSlug].id,
        provinceId: nc.id,
        districtId: district.id,
        municipalityId: municipality?.id,
        opportunitiesJson: opps,
        assetsJson: assets,
        tagsJson: [catSlug, dCode, "pdf-source"],
        status,
        lastVerifiedAt: verified ? new Date(ncReviewedAt) : null,
        verificationTier: verified ? "desktop" : "unverified",
        canonicalKey: canonicalEntityKey("northern-cape", name, lat, lng),
        retrievedAt: new Date(ncReviewedAt),
        sourceVersion: ncSourceVersion,
        verificationSource: verified ? sourceRef : null,
        verificationNotes: verified ? ncVerificationNotes : "Awaiting verification.",
        coordQuality: "town-centre",
        coordSource: verified ? sourceRef || "NC_ICT_Ecosystem_Presentation.pptx.pdf" : null,
        sourceConfidence: "historical-presentation",
        verificationExpiresAt: verified ? new Date(ncExpiresAt) : null,
        evidenceJson: verified
          ? [
              {
                title: "NC ICT Ecosystem Presentation (mLab NC)",
                url: null,
                documentRef: sourceRef || "NC_ICT_Ecosystem_Presentation.pptx.pdf",
                capturedAt: "2025-01-15",
              },
            ]
          : [],
        ownerId: ncAdmin?.id || superAdmin?.id || null,
        reviewedById: verified ? ncAdmin?.id || superAdmin?.id || null : null,
        organisationId: primaryOrgId,
        publishedAt: status === "PUBLISHED" ? new Date("2025-01-15") : null,
        website: null,
      },
    });
    await prisma.sourceRecord.create({
      data: {
        locationId: loc.id,
        title: "NC ICT Ecosystem Presentation (mLab NC, Updated 2025)",
        documentRef: sourceRef || "NC_ICT_Ecosystem_Presentation.pptx.pdf",
        url: null,
        notes: "Desktop-verified geo-pin from the 2025 presentation (reviewed 2026-08-21). Coordinates remain town-centre quality until a field visit.",
        capturedById: superAdmin?.id || null,
        sourceVersion: "nc-presentation-2025-01",
        confidence: "historical",
        connector: "nc-presentation",
        retrievedAt: new Date(ncReviewedAt),
        licence: "historical-presentation",
      },
    });
    if (verified) verifiedCount += 1;
  }

  let nationalCount = 0;
  const provinceBySlug = Object.fromEntries(Object.values(provinceMap).map((p) => [p.slug, p]));
  for (const row of nationalDirectory) {
    const province = provinceBySlug[row.province];
    const category = catMap[row.category];
    if (!province || !category) continue;
    const existing = await prisma.location.findUnique({ where: { slug: row.slug }, select: { id: true } });
    if (existing) continue;
    const loc = await prisma.location.create({
      data: {
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        description: row.summary,
        latitude: row.lat,
        longitude: row.lng,
        address: row.address || null,
        categoryId: category.id,
        provinceId: province.id,
        opportunitiesJson: [],
        assetsJson: [],
        tagsJson: ["public-directory", row.province, row.category],
        status: "PUBLISHED",
        lastVerifiedAt: null,
        verificationTier: "directory",
        canonicalKey: canonicalEntityKey(row.province, row.name, row.lat, row.lng),
        retrievedAt: new Date(nationalRetrievedAt),
        sourceVersion: nationalSourceVersion,
        verificationSource: "public-directory",
        verificationNotes: "Public directory pin at city-centre quality. Not a field verification.",
        coordQuality: "directory-only",
        coordSource: "national-directory",
        sourceConfidence: "public-directory",
        publishedAt: new Date(nationalRetrievedAt),
        ownerId: superAdmin?.id || null,
      },
    });
    await prisma.sourceRecord.create({
      data: {
        locationId: loc.id,
        title: "National public directory",
        notes: "Canonical public institution used to exercise multi-province search and load tests.",
        capturedById: superAdmin?.id || null,
        sourceVersion: nationalSourceVersion,
        confidence: "public-directory",
        connector: "national-directory",
        retrievedAt: new Date(nationalRetrievedAt),
        licence: "public-directory",
      },
    });
    nationalCount += 1;
  }

  // PDF p.9 funding sources / p.12–13 programmes & events only (no invented sites)
  await prisma.fundingCall.createMany({
    data: [
      {
        slug: "tia-innovation",
        title: "TIA (Technology Innovation Agency)",
        summary: "Grant / R&D funding listed among NC ecosystem funding sources (PDF p.9).",
        description: "Contact: info@tia.org.za · 012 472 2700 · https://www.tia.org.za/",
        amount: "Grant / R&D (see TIA)",
        url: "https://www.tia.org.za/",
        status: "PUBLISHED",
        provinceId: nc.id,
        organisationId: org.id,
        tagsJson: ["funding", "TIA", "R&D"],
        publishedAt: new Date(),
      },
      {
        slug: "sefa-finance",
        title: "SEFA",
        summary: "Finance funding source listed in mLab NC ecosystem map (PDF p.9).",
        description: "Contact: helpline@sefa.org.za · 053 832 2275 · http://www.sefa.org.za/",
        url: "http://www.sefa.org.za/",
        status: "PUBLISHED",
        provinceId: nc.id,
        tagsJson: ["funding", "SEFA"],
        publishedAt: new Date(),
      },
      {
        slug: "idc-nc",
        title: "IDC Northern Cape",
        summary: "Industrial development finance listed on PDF p.5 and p.9.",
        description: "Contact: RodneyB@idc.co.za · 053 807 1053 · https://www.idc.co.za/",
        url: "https://www.idc.co.za/",
        status: "PUBLISHED",
        provinceId: nc.id,
        tagsJson: ["funding", "IDC"],
        publishedAt: new Date(),
      },
    ],
  });

  await prisma.ecosystemEvent.createMany({
    data: [
      {
        slug: "ncdev-hack",
        title: "NCDEV Hack",
        summary: "Events & programmes listing from PDF p.12.",
        startsAt: new Date("2026-09-01T09:00:00"),
        venue: "Northern Cape (see NCDEV)",
        status: "PUBLISHED",
        provinceId: nc.id,
        organisationId: org.id,
        tagsJson: ["events", "hackathon"],
        onlineUrl: "https://www.ncdev.co.za/",
      },
      {
        slug: "national-science-week-spu",
        title: "National Science Week (SPU)",
        summary: "Listed under events & programmes (PDF p.12).",
        startsAt: new Date("2026-08-03T09:00:00"),
        venue: "Sol Plaatje University, Kimberley",
        latitude: -28.7282,
        longitude: 24.7499,
        status: "PUBLISHED",
        provinceId: nc.id,
        tagsJson: ["events", "science"],
      },
      {
        slug: "francis-baard-gew",
        title: "Francis Baard GEW",
        summary: "Global Entrepreneurship Week related event (PDF p.3, p.12).",
        startsAt: new Date("2026-11-18T09:00:00"),
        venue: "Frances Baard District",
        latitude: -28.7282,
        longitude: 24.7499,
        status: "PUBLISHED",
        provinceId: nc.id,
        tagsJson: ["events", "entrepreneurship"],
        onlineUrl: "https://fbdmentrepreneurweek.co.za",
      },
    ],
  });

  await prisma.programme.createMany({
    data: [
      {
        slug: "codetribe-academy-mlab",
        title: "CodeTribe Academy (mLab)",
        summary: "Training provider / digital skills pipeline (PDF p.9, p.11).",
        description: "Mobile app and web development training. Contact: northerncape@mlab.co.za · 012 844 0240",
        status: "PUBLISHED",
        provinceId: nc.id,
        organisationId: org.id,
        tagsJson: ["skills", "mLab"],
      },
      {
        slug: "mlab-digital-empowerment",
        title: "mLab NC Digital Empowerment Programme",
        summary: "Scale digital training to major towns (PDF p.11 strategic gap response).",
        status: "PUBLISHED",
        provinceId: nc.id,
        organisationId: org.id,
        tagsJson: ["skills", "empowerment"],
      },
      {
        slug: "cferis-incubation",
        title: "CFERIS Incubator (TVET campuses)",
        summary: "Incubation on TVET campuses including Kathu and De Aar (PDF p.5,7,10).",
        status: "PUBLISHED",
        provinceId: nc.id,
        tagsJson: ["incubation", "TVET"],
      },
    ],
  });

  await prisma.procurement.createMany({
    data: [
      {
        slug: "get-involved-partner",
        title: "Partner with mLab NC",
        summary: "Co-host programmes, sponsor training, or collaborate (PDF p.14).",
        description: "Contact northerncape@mlab.co.za — not a formal tender; collaboration call from the ecosystem presentation.",
        url: "https://www.mlab.co.za/nc",
        status: "PUBLISHED",
        provinceId: nc.id,
        organisationId: org.id,
        tagsJson: ["partnership", "mLab"],
      },
    ],
  });

  await prisma.appSetting.createMany({
    data: [
      { key: "defaultLocale", value: JSON.stringify("en") },
      { key: "supportedLocales", value: JSON.stringify(["en", "af", "xh", "zu"]) },
      { key: "mapClusterRadius", value: JSON.stringify(50) },
      { key: "publicTitle", value: JSON.stringify(publicTitle) },
      { key: "dataSource", value: JSON.stringify(dataSource) },
    ],
  });

  if (superAdmin) {
    await prisma.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "SEED",
        entityType: "System",
        entityId: "pdf-only",
        metadataJson: {
          verifiedCount,
          totalLocations: locations.length,
          source: "NC_ICT_Ecosystem_Presentation.pptx.pdf",
        },
      },
    });
  }

  // Write spreadsheet exports for PDF sites only
  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const headers = [
    "id_slug", "name", "province", "district_code", "district", "municipality_code", "municipality",
    "latitude", "longitude", "category", "summary", "opportunities", "assets", "status",
    "last_verified", "verification_source", "source",
  ];
  const lines = [headers.join(",")];
  for (const row of locations) {
    const [slug, name, dCode, mCode, lat, lng, catSlug, summary, opps, assets, status, verified, sourceRef] = row;
    const d = NC_DISTRICTS.find((x) => x.code === dCode);
    const m = d?.muns.find((x) => x.code === mCode);
    const cells = [
      slug, name, "Northern Cape", dCode, d?.name || "", mCode, m?.name || "",
      lat, lng, catSlug, `"${String(summary).replace(/"/g, '""')}"`,
      `"${opps.join("; ")}"`, `"${assets.join("; ")}"`, status,
      verified ? ncReviewedAt : "",
      verified ? sourceRef : "",
      "NC_ICT_Ecosystem_Presentation.pptx.pdf",
    ];
    lines.push(cells.join(","));
  }
  fs.writeFileSync(path.join(outDir, "NC_ICT_Locations_Full.csv"), lines.join("\n"), "utf8");
  fs.writeFileSync(
    path.join(outDir, "boundaries", "nc_districts.geojson"),
    JSON.stringify(ncDistricts, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "boundaries", "nc_municipalities.geojson"),
    JSON.stringify(ncMunicipalities, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "boundaries", "sa_provinces.geojson"),
    JSON.stringify(nationalBoundaries, null, 2)
  );

  console.log(
    `Seeded ${locations.length} curated NC towns (${verifiedCount} desktop-verified ${ncReviewedAt}, expire ${ncExpiresAt}; not field surveys).`
  );
  console.log(`Seeded ${nationalCount} national public-directory locations across nine provinces (unverified scaffold).`);
  console.log(`Seeded ${pdfOrganisations.length} PDF organisations / contacts (${orgCoordsCount} with map pins).`);
  console.log(
    "Live catalogue is 9 NC towns + 49 organisations + 30 national pins. Candidate CSV rows are not live — do not claim 100+ locations."
  );
  console.log("Boundaries: NC districts/municipalities (MDB / municipalities.co.za layout).");
  console.log("Source: NC_ICT_Ecosystem_Presentation.pptx.pdf");
  if (superAdmin) {
    console.log(`Admin user seeded: ${superAdmin.email} (password from SEED_ADMIN_PASSWORD / demo env — not logged)`);
  }
  if (ncAdmin) console.log(`Provincial admin seeded: ${ncAdmin.email}`);
  if (orgAdminCreated) console.log("Org admin seeded (password not logged).");
  if (allowDemo) console.log("ALLOW_DEMO_USERS=1 — local demo passwords only; never use in production.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
