import Link from "next/link";
import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function ProcurementPage() {
  const items = (await getEcosystemItems("procurement")) as Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    closingDate: Date | null;
    budget: string | null;
    url: string | null;
    tags: string[];
  }>;
  return (
    <div className="page">
      <p className="eyebrow">Ecosystem</p>
      <h1>Procurement</h1>
      <p className="text-muted">Open tenders and RFPs linked to digital and ICT delivery.</p>
      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel-card flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold">
                <Link href={`/procurement/${item.slug}`} className="text-g700 hover:underline">
                  {item.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-[#34413c]">{item.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.budget && <span className="chip chip-active">{item.budget}</span>}
                {item.closingDate && (
                  <span className="chip">
                    Closes {new Date(item.closingDate).toLocaleDateString()}
                  </span>
                )}
                {(item.tags || []).map((tag) => (
                  <span key={tag} className="chip">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/procurement/${item.slug}`} className="btn btn-outline text-xs">
                View details →
              </Link>
              {item.url && (
                <a href={item.url} className="btn text-xs" target="_blank" rel="noreferrer">
                  View tender
                </a>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && <p className="text-muted">No published tenders yet.</p>}
      </div>
      <p className="mt-6 text-sm">
        <Link className="text-g700 font-semibold" href="/submit?type=procurement">
          Submit a tender notice →
        </Link>
      </p>
    </div>
  );
}
