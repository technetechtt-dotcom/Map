import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/shape";

export const dynamic = "force-dynamic";

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; location?: string }>;
}) {
  const filters = await searchParams;
  const rows = await prisma.organisation.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const types = Array.from(new Set(rows.map((o) => o.type))).sort();
  let orgs = rows.map((o) => ({
    ...o,
    locationSlugs: parseJsonArray(o.locationSlugsJson),
  }));

  if (filters.type) {
    orgs = orgs.filter((o) => o.type === filters.type);
  }
  if (filters.location) {
    orgs = orgs.filter(
      (o) =>
        o.locationSlugs.includes(filters.location!) ||
        o.locationSlugs.includes("province")
    );
  }

  const byType = new Map<string, typeof orgs>();
  for (const o of orgs) {
    if (!byType.has(o.type)) byType.set(o.type, []);
    byType.get(o.type)!.push(o);
  }

  return (
    <div className="page">
      <p className="eyebrow">From the mLab NC presentation</p>
      <h1>Key contacts &amp; organisations</h1>
      <p className="text-muted mb-4 max-w-3xl">
        Government, training, funding, industry and mentorship contacts published in{" "}
        <strong>NC_ICT_Ecosystem_Presentation.pptx.pdf</strong> (pages 3–9, 12, 14). Map pins use WGS84
        place/street coordinates cross-checked against Google Maps–compatible sources; national-only
        HQs without an NC office stay directory-only.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/organisations"
          className={`chip ${!filters.type ? "chip-active" : ""}`}
        >
          All ({rows.length})
        </Link>
        {types.map((t) => (
          <Link
            key={t}
            href={`/organisations?type=${encodeURIComponent(t)}`}
            className={`chip ${filters.type === t ? "chip-active" : ""}`}
          >
            {t}
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted mb-6">
        Showing {orgs.length} organisation{orgs.length === 1 ? "" : "s"}
        {filters.type ? ` · ${filters.type}` : ""}
        {filters.location ? ` · linked to ${filters.location}` : ""}.
      </p>

      {Array.from(byType.entries()).map(([type, list]) => (
        <section key={type} className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-g700">{type}</h2>
          <div className="card-grid">
            {list.map((o) => (
              <article key={o.id} className="panel-card">
                <h3 className="font-bold">{o.name}</h3>
                {o.sourcePage && (
                  <p className="meta text-xs text-muted mt-1">Source: PDF {o.sourcePage}</p>
                )}
                {o.description && (
                  <p className="mt-2 text-sm text-[#34413c]">{o.description}</p>
                )}
                <dl className="mt-3 grid gap-1 text-sm">
                  {o.address && (
                    <div>
                      <dt className="inline text-muted">Location</dt>
                      <dd className="inline"> · {o.address}</dd>
                    </div>
                  )}
                  {o.latitude != null && o.longitude != null && (
                    <div>
                      <dt className="inline text-muted">Map</dt>
                      <dd className="inline">
                        {" · "}
                        <a
                          className="text-g700"
                          href={`https://www.google.com/maps?q=${o.latitude},${o.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {o.latitude.toFixed(5)}, {o.longitude.toFixed(5)}
                        </a>
                      </dd>
                    </div>
                  )}
                  {o.email && (
                    <div>
                      <dt className="inline text-muted">Email</dt>
                      <dd className="inline">
                        {" · "}
                        <a className="text-g700" href={`mailto:${o.email}`}>
                          {o.email}
                        </a>
                      </dd>
                    </div>
                  )}
                  {o.phone && (
                    <div>
                      <dt className="inline text-muted">Phone</dt>
                      <dd className="inline"> · {o.phone}</dd>
                    </div>
                  )}
                  {o.website && (
                    <div>
                      <dt className="inline text-muted">Web</dt>
                      <dd className="inline">
                        {" · "}
                        <a className="text-g700" href={o.website} target="_blank" rel="noreferrer">
                          {o.website.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  {o.locationSlugs.map((s) =>
                    s === "province" ? (
                      <span key={s} className="chip">
                        Province-wide
                      </span>
                    ) : (
                      <Link key={s} href={`/locations/${s}`} className="chip">
                        {s}
                      </Link>
                    )
                  )}
                </div>
                <Link href={`/org/${o.slug}`} className="mt-3 inline-block text-sm font-semibold text-g700">
                  Open profile →
                </Link>
              </article>
            ))}
          </div>
        </section>
      ))}

      {orgs.length === 0 && (
        <p className="text-muted">No organisations match this filter.</p>
      )}
    </div>
  );
}
