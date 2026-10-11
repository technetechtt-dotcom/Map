import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DistrictPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const district = await prisma.district.findFirst({
    where: { OR: [{ code: slug }, { name: { equals: slug.replace(/-/g, " "), mode: "insensitive" } }] },
    include: { province: true, municipalities: true },
  });
  if (!district) notFound();
  const locations = await prisma.location.count({ where: { districtId: district.id, status: "PUBLISHED" } });
  return (
    <div className="page">
      <p className="eyebrow">{district.province.name}</p>
      <h1>{district.name}</h1>
      <p className="text-muted">{locations} published locations</p>
      <p className="mt-3"><Link className="text-g700 font-semibold" href={`/provinces/${district.province.slug}`}>← {district.province.name}</Link></p>
      <h2 className="mt-6 text-lg font-bold">Municipalities</h2>
      <div className="card-grid">
        {district.municipalities.map((muni) => (
          <article key={muni.id} className="panel-card">
            <h3 className="font-semibold"><Link href={`/municipalities/${muni.code}`}>{muni.name}</Link></h3>
          </article>
        ))}
      </div>
    </div>
  );
}
