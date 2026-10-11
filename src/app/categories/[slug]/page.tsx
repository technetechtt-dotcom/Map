import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALIASES: Record<string, string[]> = {
  universities: ["university", "higher-education", "knowledge-hub"],
  tvet: ["tvet", "college", "education-tvet"],
  "innovation-hubs": ["innovation-hub", "digital-hub", "hub"],
  "digital-infrastructure": ["digital-infrastructure", "infrastructure", "connectivity"],
};

export default async function CategoryLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const aliases = ALIASES[slug] || [slug];
  const category = await prisma.category.findFirst({
    where: { OR: aliases.map((value) => ({ slug: value })) },
  });
  if (!category) notFound();
  const locations = await prisma.location.findMany({
    where: { categoryId: category.id, status: "PUBLISHED" },
    include: { province: true },
    take: 60,
  });
  return (
    <div className="page">
      <p className="eyebrow">Categories</p>
      <h1>{category.name}</h1>
      <p className="text-muted">{category.description || `Published ${category.name.toLowerCase()} across South Africa.`}</p>
      <div className="card-grid mt-6">
        {locations.map((location) => (
          <article key={location.id} className="panel-card">
            <p className="text-xs text-muted">{location.province?.name}</p>
            <h3 className="font-semibold"><Link href={`/locations/${location.slug}`}>{location.name}</Link></h3>
            <p className="text-sm text-muted">{location.summary}</p>
          </article>
        ))}
        {locations.length === 0 && <p className="text-muted">No published records in this category yet.</p>}
      </div>
    </div>
  );
}
