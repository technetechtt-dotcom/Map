import Link from "next/link";
import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function FundingPage() {
  const items = (await getEcosystemItems("funding")) as Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    amount: string | null;
    deadline: Date | null;
    url: string | null;
    tags: string[];
  }>;
  return (
    <div className="page">
      <p className="eyebrow">Ecosystem</p>
      <h1>Funding calls</h1>
      <p className="text-muted">Open and upcoming funding opportunities for ICT, skills and innovation.</p>
      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel-card">
            <h2 className="text-lg font-bold">
              <Link href={`/funding/${item.slug}`} className="text-g700">{item.title}</Link>
            </h2>
            <p className="mt-2 text-sm text-[#34413c]">{item.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.amount && <span className="chip chip-active">{item.amount}</span>}
              {item.deadline && (
                <span className="chip">
                  Deadline {new Date(item.deadline).toLocaleDateString()}
                </span>
              )}
              {(item.tags || []).map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
            {item.url && (
              <a href={item.url} className="btn mt-4" target="_blank" rel="noreferrer">
                Apply / details
              </a>
            )}
          </article>
        ))}
        {items.length === 0 && <p className="text-muted">No published funding calls yet.</p>}
      </div>
      <p className="mt-6 text-sm">
        <Link className="text-g700 font-semibold" href="/submit?type=funding">
          Submit a funding opportunity →
        </Link>
      </p>
    </div>
  );
}
