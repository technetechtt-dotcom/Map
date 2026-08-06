import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { shapeLocation, parseJsonArray } from "@/lib/shape";
import { trackEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function LocationProfilePage({
  params,
}: {
  params: { slug: string };
}) {
  const row = await prisma.location.findFirst({
    where: { OR: [{ slug: params.slug }, { id: params.slug }] },
    include: {
      category: true,
      province: true,
      district: true,
      municipality: true,
      organisation: true,
      sources: true,
    },
  });
  if (!row) notFound();

  const loc = shapeLocation(row);

  const allOrgs = await prisma.organisation.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { name: "asc" },
  });
  const contacts = allOrgs
    .map((o) => ({
      ...o,
      locationSlugs: parseJsonArray(o.locationSlugsJson),
    }))
    .filter(
      (o) =>
        o.locationSlugs.includes(loc.slug) || o.locationSlugs.includes("province")
    )
    .sort((a, b) => {
      const aExact = a.locationSlugs.includes(loc.slug) ? 0 : 1;
      const bExact = b.locationSlugs.includes(loc.slug) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.name.localeCompare(b.name);
    });

  await trackEvent({
    eventType: "location.view",
    path: `/locations/${loc.slug}`,
    locationId: loc.id,
    provinceId: row.provinceId,
  }).catch(() => undefined);

  return (
    <div className="page">
      <p className="eyebrow">{loc.province.name} · {loc.category.name}</p>
      <h1>{loc.name}</h1>
      <p className="text-muted mb-4 max-w-3xl text-lg">{loc.summary}</p>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="chip chip-active">{loc.status}</span>
        {loc.lastVerifiedAt && (
          <span className="chip">Verified {new Date(loc.lastVerifiedAt).toLocaleDateString()}</span>
        )}
        {loc.district && <span className="chip">{loc.district.name}</span>}
        {loc.municipality && <span className="chip">{loc.municipality.name}</span>}
        <Link href={`/organisations?location=${loc.slug}`} className="chip">
          {contacts.length} contacts
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel-card">
          {loc.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={loc.imageUrl}
              alt={loc.name}
              className="mb-4 max-h-72 w-full rounded-xl object-cover"
            />
          )}
          <h2 className="mb-2 text-lg font-bold">Overview</h2>
          <p className="whitespace-pre-wrap leading-relaxed text-[#34413c]">
            {loc.description || loc.summary}
          </p>

          <h3 className="mb-2 mt-6 font-bold">Priority opportunities</h3>
          <ul className="list-disc space-y-1 pl-5">
            {loc.opportunities.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>

          <h3 className="mb-2 mt-6 font-bold">Assets & institutions</h3>
          <ul className="list-disc space-y-1 pl-5">
            {loc.assets.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>

          <h3 className="mb-2 mt-8 font-bold">Key contacts &amp; organisations</h3>
          <p className="text-sm text-muted mb-3">
            From the NC ICT Ecosystem Presentation (mLab NC). Town-specific contacts listed first;
            province-wide partners follow.
          </p>
          <div className="grid gap-3">
            {contacts.map((c) => {
              const townSpecific = c.locationSlugs.includes(loc.slug);
              return (
                <article
                  key={c.id}
                  className="rounded-xl border border-line bg-soft p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold">{c.name}</h4>
                      <p className="text-xs text-muted">
                        {c.type}
                        {c.sourcePage ? ` · PDF ${c.sourcePage}` : ""}
                        {townSpecific ? " · Town listing" : " · Province-wide"}
                      </p>
                    </div>
                    <Link href={`/org/${c.slug}`} className="text-sm font-semibold text-g700">
                      Profile
                    </Link>
                  </div>
                  {c.description && (
                    <p className="mt-2 text-sm text-[#34413c]">{c.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {c.email && (
                      <a className="text-g700" href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                    )}
                    {c.phone && <span>{c.phone}</span>}
                    {c.website && (
                      <a className="text-g700" href={c.website} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
            {contacts.length === 0 && (
              <p className="text-muted text-sm">No linked contacts for this town yet.</p>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="panel-card">
            <h2 className="mb-2 text-lg font-bold">Details</h2>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted">Coordinates</dt>
                <dd>
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Category</dt>
                <dd style={{ color: loc.category.color }} className="font-semibold">
                  {loc.category.icon} {loc.category.name}
                </dd>
              </div>
              {loc.organisation && (
                <div>
                  <dt className="text-muted">Primary organisation</dt>
                  <dd>
                    <Link className="text-g700 font-semibold" href={`/org/${loc.organisation.slug}`}>
                      {loc.organisation.name}
                    </Link>
                  </dd>
                </div>
              )}
              {loc.website && (
                <div>
                  <dt className="text-muted">Website</dt>
                  <dd>
                    <a className="text-g700" href={loc.website}>
                      {loc.website}
                    </a>
                  </dd>
                </div>
              )}
              {loc.verificationSource && (
                <div>
                  <dt className="text-muted">Verification source</dt>
                  <dd>{loc.verificationSource}</dd>
                </div>
              )}
            </dl>
            <Link href={`/?q=${encodeURIComponent(loc.name)}`} className="btn mt-4">
              View on map
            </Link>
          </div>

          <div className="panel-card">
            <h2 className="mb-2 text-lg font-bold">Source records</h2>
            {row.sources.length === 0 && (
              <p className="text-muted text-sm">No sources attached.</p>
            )}
            <ul className="space-y-3 text-sm">
              {row.sources.map((s) => (
                <li key={s.id} className="border-b border-line pb-2">
                  <p className="font-semibold">{s.title}</p>
                  {s.documentRef && <p className="text-muted">{s.documentRef}</p>}
                  {s.url && (
                    <a className="text-g700" href={s.url}>
                      {s.url}
                    </a>
                  )}
                  {s.notes && <p>{s.notes}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
