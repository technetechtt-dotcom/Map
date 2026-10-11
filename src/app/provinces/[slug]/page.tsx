import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProvincePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const province = await prisma.province.findFirst({
    where: { OR: [{ slug }, { code: slug.toUpperCase() }] },
    include: { districts: { include: { municipalities: true } } },
  });
  if (!province) notFound();
  const [locations, organisations, funding] = await Promise.all([
    prisma.location.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.organisation.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
    prisma.fundingCall.count({ where: { provinceId: province.id, status: "PUBLISHED" } }),
  ]);
  return (
    <div className="page">
      <p className="eyebrow">Geography</p>
      <h1>{province.name}</h1>
      <p className="text-muted">{locations} published locations · {organisations} organisations · {funding} funding calls</p>
      <p className="mt-3"><Link className="text-g700 font-semibold" href={`/?province=${province.slug}`}>Open map →</Link></p>
      <h2 className="mt-6 text-lg font-bold">Districts</h2>
      <div className="card-grid">
        {province.districts.map((district) => (
          <article key={district.id} className="panel-card">
            <h3 className="font-semibold"><Link href={`/districts/${district.code}`}>{district.name}</Link></h3>
            <p className="text-sm text-muted">{district.municipalities.length} municipalities</p>
          </article>
        ))}
      </div>
    </div>
  );
}
