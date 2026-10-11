import { prisma } from "@/lib/prisma";
import Link from "next/link";
import NationalSearchBox from "@/components/NationalSearchBox";
import { verificationFilterWhere } from "@/lib/verification";
import { PUBLIC_STATUSES } from "@/lib/shape";

export const dynamic = "force-dynamic";

export default async function NationalReportPage() {
  const [byProvince, verified, published, total, orgs, funding, events, programmes, procurement, sources] = await Promise.all([
    prisma.location.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED" } }),
    prisma.location.count({
      where: { status: { in: [...PUBLIC_STATUSES] }, ...verificationFilterWhere("current") },
    }),
    prisma.location.count({ where: { status: "PUBLISHED" } }),
    prisma.location.count(),
    prisma.organisation.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED" } }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED" } }),
    prisma.ecosystemEvent.count({ where: { status: "PUBLISHED" } }),
    prisma.programme.count({ where: { status: "PUBLISHED" } }),
    prisma.procurement.count({ where: { status: "PUBLISHED" } }),
    prisma.sourceRecord.count(),
  ]);

  const provinces = await prisma.province.findMany({ orderBy: { name: "asc" } });
  const provMap = Object.fromEntries(provinces.map((p) => [p.id, p]));
  const orgMap = Object.fromEntries(orgs.map((row) => [row.provinceId || "", row._count]));

  const rows = byProvince
    .map((r) => ({
      province: provMap[r.provinceId],
      count: r._count,
      organisations: orgMap[r.provinceId] || 0,
    }))
    .filter((r) => r.province)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="page">
      <p className="eyebrow">National intelligence</p>
      <h1>National dashboard</h1>
      <p className="text-muted mb-6 max-w-2xl">
        Province comparison, infrastructure coverage, organisations, opportunities, verification coverage and ecosystem indicators from the live catalogue.
      </p>

      <div className="stat-grid mb-6">
        <div className="stat"><strong>{published}</strong><span className="text-xs uppercase tracking-wide text-muted">Published locations</span></div>
        <div className="stat"><strong>{verified}</strong><span className="text-xs uppercase tracking-wide text-muted">Verified coverage</span></div>
        <div className="stat"><strong>{orgs.reduce((sum, row) => sum + row._count, 0)}</strong><span className="text-xs uppercase tracking-wide text-muted">Organisations</span></div>
        <div className="stat"><strong>{funding + events + programmes + procurement}</strong><span className="text-xs uppercase tracking-wide text-muted">Opportunities</span></div>
        <div className="stat"><strong>{sources}</strong><span className="text-xs uppercase tracking-wide text-muted">Source records</span></div>
        <div className="stat"><strong>{total ? Math.round((published / total) * 100) : 0}%</strong><span className="text-xs uppercase tracking-wide text-muted">Publish rate</span></div>
      </div>

      <NationalSearchBox />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="chip" href="/data-sources">Data sources</Link>
        <Link className="chip" href="/nearby">Near me</Link>
        <Link className="chip" href="/search">National search</Link>
      </div>

      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Province</th>
              <th>Code</th>
              <th>Locations</th>
              <th>Organisations</th>
              <th>Map</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.province!.id}>
                <td className="font-semibold">{r.province!.name}</td>
                <td>{r.province!.code}</td>
                <td>{r.count}</td>
                <td>{r.organisations}</td>
                <td>
                  <Link className="text-g700 font-semibold" href={`/?province=${r.province!.slug}`}>Open map →</Link>
                </td>
                <td>
                  <Link className="text-g700 font-semibold" href={`/provinces/${r.province!.slug}`}>Province page →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
