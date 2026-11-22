import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InnovationDashboardPage() {
  const province = await prisma.province.findFirst({
    where: { OR: [{ code: "NC" }, { name: { contains: "Northern Cape", mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true },
  });

  if (!province) {
    return (
      <div className="page">
        <p className="eyebrow">Provincial innovation dashboard</p>
        <h1>Northern Cape Innovation Dashboard</h1>
        <p className="text-muted">Northern Cape provincial data has not been configured yet.</p>
      </div>
    );
  }

  const [locations, organisations, funding, events, programmes, procurements, byDistrict, districts] = await Promise.all([
    prisma.location.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.organisation.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.fundingCall.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.ecosystemEvent.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.programme.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.procurement.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.location.groupBy({
      by: ["districtId"],
      where: { provinceId: province.id, status: "PUBLISHED", districtId: { not: null } },
      _count: true,
    }),
    prisma.district.findMany({ where: { provinceId: province.id }, select: { id: true, name: true, code: true } }),
  ]);

  const districtMap = Object.fromEntries(districts.map((district) => [district.id, district]));
  const districtRows = byDistrict
    .map((row) => ({ district: row.districtId ? districtMap[row.districtId] : null, count: row._count }))
    .filter((row) => row.district)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="page">
      <p className="eyebrow">Public provincial intelligence</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Northern Cape Innovation Dashboard</h1>
          <p className="mt-2 max-w-3xl text-muted">
            Live public indicators drawn from published ecosystem, opportunity and geographic records.
          </p>
        </div>
        <Link className="btn btn-outline" href="/login?callbackUrl=%2Fdashboard">Restricted stakeholder analytics</Link>
      </div>

      <div className="stat-grid mt-6">
        <div className="stat"><strong>{locations}</strong><span className="text-xs uppercase tracking-wide text-muted">Published locations</span></div>
        <div className="stat"><strong>{organisations}</strong><span className="text-xs uppercase tracking-wide text-muted">Organisations</span></div>
        <div className="stat"><strong>{funding}</strong><span className="text-xs uppercase tracking-wide text-muted">Funding calls</span></div>
        <div className="stat"><strong>{programmes}</strong><span className="text-xs uppercase tracking-wide text-muted">Programmes</span></div>
        <div className="stat"><strong>{events}</strong><span className="text-xs uppercase tracking-wide text-muted">Events</span></div>
        <div className="stat"><strong>{procurements}</strong><span className="text-xs uppercase tracking-wide text-muted">Procurement notices</span></div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel-card">
          <h2 className="mb-3 text-lg font-bold">Geographic coverage</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>District</th><th>Published locations</th></tr></thead>
              <tbody>
                {districtRows.map((row) => (
                  <tr key={row.district!.id}><td>{row.district!.name}</td><td>{row.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {districtRows.length === 0 && <p className="text-muted">No published district-level records yet.</p>}
        </section>

        <section className="panel-card">
          <h2 className="mb-3 text-lg font-bold">Explore the innovation ecosystem</h2>
          <div className="grid gap-2">
            <Link className="btn btn-outline" href={`/?province=${province.slug}`}>Open Northern Cape map</Link>
            <Link className="btn btn-outline" href="/organisations">Browse organisations</Link>
            <Link className="btn btn-outline" href="/funding">Funding opportunities</Link>
            <Link className="btn btn-outline" href="/programmes">Innovation programmes</Link>
            <Link className="btn btn-outline" href="/procurement">Procurement opportunities</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
