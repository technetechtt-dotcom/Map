import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { verificationFilterWhere } from "@/lib/verification";
import { PUBLIC_STATUSES } from "@/lib/shape";

export const dynamic = "force-dynamic";

export default async function NationalReportPage() {
  const [byProvince, verified, published, total] = await Promise.all([
    prisma.location.groupBy({ by: ["provinceId"], _count: true }),
    prisma.location.count({
      where: { status: { in: [...PUBLIC_STATUSES] }, ...verificationFilterWhere("current") },
    }),
    prisma.location.count({ where: { status: "PUBLISHED" } }),
    prisma.location.count(),
  ]);

  const provinces = await prisma.province.findMany({ orderBy: { name: "asc" } });
  const provMap = Object.fromEntries(provinces.map((p) => [p.id, p]));

  const rows = byProvince
    .map((r) => ({
      province: provMap[r.provinceId],
      count: r._count,
    }))
    .filter((r) => r.province)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="page">
      <p className="eyebrow">National coverage</p>
      <h1>National search & reporting</h1>
      <p className="text-muted mb-6 max-w-2xl">
        Nine-province scaffold. Northern Cape holds the curated, desktop-verified towns.
        Other provinces are public-directory pins so search and tenancy work nationally.
        Live seed is 9 NC towns, 49 organisations and 94 national public-directory pins — not 100+ verified locations.
      </p>

      <div className="stat-grid mb-6">
        <div className="stat">
          <strong>{total}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Total locations</span>
        </div>
        <div className="stat">
          <strong>{published}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Published</span>
        </div>
        <div className="stat">
          <strong>{verified}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Desktop / field verified</span>
        </div>
        <div className="stat">
          <strong>{provinces.length}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Provinces online</span>
        </div>
      </div>

      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Province</th>
              <th>Code</th>
              <th>Locations</th>
              <th>Map</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.province!.id}>
                <td className="font-semibold">{r.province!.name}</td>
                <td>{r.province!.code}</td>
                <td>{r.count}</td>
                <td>
                  <Link className="text-g700 font-semibold" href={`/?province=${r.province!.slug}`}>
                    Open map →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
