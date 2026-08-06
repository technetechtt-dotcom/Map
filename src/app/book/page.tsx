import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BookIndexPage() {
  const provinces = await prisma.province.findMany({ orderBy: { name: "asc" } });
  const counts = await prisma.location.groupBy({
    by: ["provinceId"],
    where: { status: { in: ["PUBLISHED", "VERIFIED"] } },
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.provinceId, c._count]));
  const total = counts.reduce((s, c) => s + c._count, 0);

  return (
    <div className="page">
      <p className="eyebrow">Publications</p>
      <h1>Printable system book</h1>
      <p className="text-muted mb-6 max-w-2xl">
        Printable Northern Cape ICT Ecosystem Map — styled after the mLab NC presentation, with
        PDF pages 3–7 opportunity zones, district municipality maps, and exact key-contact pins.
        Print to paper or <strong>Save as PDF</strong> from your browser.
      </p>

      <div className="card-grid">
        <article className="panel-card">
          <h2 className="text-lg font-bold">Northern Cape presentation book</h2>
          <p className="mt-2 text-sm text-muted">
            All provinces · {total} published / verified locations in broader view; open NC book for
            mLab presentation zones.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn" href="/book/print?province=northern-cape">
              Open book
            </Link>
            <a
              className="btn btn-outline"
              href="/api/book/download?province=northern-cape&format=html"
              download
            >
              Download HTML
            </a>
          </div>
        </article>

        {provinces.map((p) => (
          <article key={p.id} className="panel-card">
            <h2 className="text-lg font-bold">{p.name}</h2>
            <p className="mt-2 text-sm text-muted">
              {countMap[p.id] || 0} locations · code {p.code}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="btn" href={`/book/print?province=${p.slug}`}>
                Open provincial book
              </Link>
              <a
                className="btn btn-outline"
                href={`/api/book/download?province=${encodeURIComponent(p.slug)}&format=html`}
                download
              >
                Download HTML
              </a>
            </div>
          </article>
        ))}
      </div>

      <div className="panel-card mt-6">
        <h2 className="mb-2 font-bold">What is included</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>mLab NC-style cover (startups · skills · hubs · funding)</li>
          <li>
            Opportunity chapters matching PDF p.3–7 (Kimberley, Upington, Kathu, Carnarvon, De Aar)
          </li>
          <li>District municipality maps with numbered pins for key contacts &amp; organisations</li>
          <li>Strategic opportunity callouts and ICT startup opportunity lists</li>
          <li>Full location and organisations directories with WGS84 coordinates</li>
          <li>Funding, events, programmes and A–Z index</li>
        </ul>
      </div>
    </div>
  );
}
