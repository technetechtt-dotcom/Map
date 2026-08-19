import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/shape";

export const dynamic = "force-dynamic";

export default async function OrgPage({ params }: { params: { slug: string } }) {
  const org = await prisma.organisation.findFirst({
    where: { slug: params.slug, status: "PUBLISHED" },
    include: {
      province: true,
      category: true,
      relationshipsFrom: { where: { status: "PUBLISHED" }, include: { target: true } },
      relationshipsTo: { where: { status: "PUBLISHED" }, include: { source: true } },
    },
  });
  if (!org) notFound();

  const locationSlugs = parseJsonArray(org.locationSlugsJson).filter((s) => s !== "province");
  const linkedLocations = locationSlugs.length
    ? await prisma.location.findMany({
        where: {
          slug: { in: locationSlugs },
          status: { in: ["PUBLISHED", "VERIFIED"] },
        },
        include: { category: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="page">
      <p className="eyebrow">Organisation · PDF {org.sourcePage || "source"}</p>
      <h1>{org.name}</h1>
      <p className="text-muted">
        {org.type}
        {org.province ? ` · ${org.province.name}` : ""}
      </p>
      {org.description && <p className="mt-4 max-w-2xl">{org.description}</p>}

      {[...parseJsonArray(org.servicesJson), ...parseJsonArray(org.skillsJson), ...parseJsonArray(org.technologiesJson)].length > 0 && (
        <section className="panel-card mt-6">
          <h2 className="mb-3 text-lg font-bold">Capabilities</h2>
          <div className="flex flex-wrap gap-2">
            {parseJsonArray(org.servicesJson).map((value) => <span key={`service-${value}`} className="chip">Service: {value}</span>)}
            {parseJsonArray(org.skillsJson).map((value) => <span key={`skill-${value}`} className="chip">Skill: {value}</span>)}
            {parseJsonArray(org.technologiesJson).map((value) => <span key={`tech-${value}`} className="chip">Technology: {value}</span>)}
          </div>
        </section>
      )}

      {(org.relationshipsFrom.length > 0 || org.relationshipsTo.length > 0) && (
        <section className="panel-card mt-6" aria-labelledby="relationship-heading">
          <h2 id="relationship-heading" className="mb-3 text-lg font-bold">Ecosystem relationships</h2>
          <ul className="grid gap-2">
            {org.relationshipsFrom.map((relationship) => (
              <li key={relationship.id}><strong>{relationship.type.replaceAll("_", " ")}</strong> <Link className="text-g700" href={`/org/${relationship.target.slug}`}>{relationship.target.name}</Link></li>
            ))}
            {org.relationshipsTo.map((relationship) => (
              <li key={relationship.id}><Link className="text-g700" href={`/org/${relationship.source.slug}`}>{relationship.source.name}</Link> <strong>{relationship.type.replaceAll("_", " ")}</strong> this organisation</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {org.verified && <span className="chip chip-active">Verified from presentation</span>}
        <span className="chip">{org.status}</span>
        {org.coordQuality && <span className="chip">Map: {org.coordQuality}</span>}
        {parseJsonArray(org.locationSlugsJson).map((s) => (
          <span key={s} className="chip">
            {s === "province" ? "Province-wide" : s}
          </span>
        ))}
      </div>

      <div className="panel-card mt-6 max-w-xl">
        <h2 className="mb-3 text-lg font-bold">Contact details</h2>
        <dl className="grid gap-2 text-sm">
          {org.address && (
            <div>
              <dt className="text-muted">Physical location</dt>
              <dd>{org.address}</dd>
            </div>
          )}
          {org.latitude != null && org.longitude != null && (
            <div>
              <dt className="text-muted">Coordinates (WGS84)</dt>
              <dd>
                <a
                  className="text-g700 font-semibold"
                  href={`https://www.google.com/maps?q=${org.latitude},${org.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {org.latitude.toFixed(6)}, {org.longitude.toFixed(6)} · Open in Google Maps
                </a>
                {org.coordSource && (
                  <p className="mt-1 text-xs text-muted">{org.coordSource}</p>
                )}
              </dd>
            </div>
          )}
          {org.latitude == null && (
            <div>
              <dt className="text-muted">Map pin</dt>
              <dd className="text-muted">
                National / directory-only listing — no Northern Cape street pin (avoided inaccurate map
                offset).
              </dd>
            </div>
          )}
          {org.email && (
            <div>
              <dt className="text-muted">Email</dt>
              <dd>
                <a className="text-g700 font-semibold" href={`mailto:${org.email}`}>
                  {org.email}
                </a>
              </dd>
            </div>
          )}
          {org.phone && (
            <div>
              <dt className="text-muted">Phone</dt>
              <dd>{org.phone}</dd>
            </div>
          )}
          {org.website && (
            <div>
              <dt className="text-muted">Website</dt>
              <dd>
                <a className="text-g700" href={org.website} target="_blank" rel="noreferrer">
                  {org.website}
                </a>
              </dd>
            </div>
          )}
          {!org.email && !org.phone && !org.website && !org.address && (
            <p className="text-muted">No contact details published on the PDF listing.</p>
          )}
        </dl>
      </div>

      {linkedLocations.length > 0 && (
        <>
          <h2 className="mt-8 text-xl font-bold">Linked map locations</h2>
          <div className="card-grid">
            {linkedLocations.map((l) => (
              <Link key={l.id} href={`/locations/${l.slug}`} className="panel-card">
                <p className="text-sm font-bold" style={{ color: l.category.color }}>
                  {l.category.name}
                </p>
                <h3 className="font-semibold">{l.name}</h3>
                <p className="text-sm text-muted">{l.summary}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="mt-6">
        <Link className="text-g700 font-semibold" href="/organisations">
          ← All organisations
        </Link>
      </p>
    </div>
  );
}
