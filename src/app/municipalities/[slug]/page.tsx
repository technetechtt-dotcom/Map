import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MunicipalityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const municipality = await prisma.municipality.findFirst({
    where: { OR: [{ code: slug }, { name: { equals: slug.replace(/-/g, " "), mode: "insensitive" } }] },
    include: { district: { include: { province: true } } },
  });
  if (!municipality) notFound();
  const locations = await prisma.location.findMany({
    where: { municipalityId: municipality.id, status: "PUBLISHED" },
    include: { category: true },
    take: 40,
  });
  return (
    <div className="page">
      <p className="eyebrow">{municipality.district.province.name} · {municipality.district.name}</p>
      <h1>{municipality.name}</h1>
      <p className="mt-3"><Link className="text-g700 font-semibold" href={`/districts/${municipality.district.code}`}>← {municipality.district.name}</Link></p>
      <div className="card-grid mt-6">
        {locations.map((location) => (
          <article key={location.id} className="panel-card">
            <p className="text-xs font-bold" style={{ color: location.category.color }}>{location.category.name}</p>
            <h3 className="font-semibold"><Link href={`/locations/${location.slug}`}>{location.name}</Link></h3>
            <p className="text-sm text-muted">{location.summary}</p>
          </article>
        ))}
        {locations.length === 0 && <p className="text-muted">No published locations in this municipality yet.</p>}
      </div>
    </div>
  );
}
