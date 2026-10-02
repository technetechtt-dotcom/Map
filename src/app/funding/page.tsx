import Link from "next/link";
import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function FundingPage({
  searchParams,
}: {
  searchParams?: Promise<{ archive?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const showArchive = sp.archive === "1";
  const allItems = (await getEcosystemItems("funding")) as Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    amount: string | null;
    deadline: Date | null;
    url: string | null;
    tags: string[];
    freshness: string;
    isCurrent: boolean;
    isExpired: boolean;
  }>;

  const currentItems = allItems.filter((i) => i.isCurrent);
  const archivedItems = allItems.filter((i) => i.isExpired);
  const items = showArchive ? allItems : currentItems.length > 0 ? currentItems : allItems;

  return (
    <div className="page">
      <p className="eyebrow">Ecosystem</p>
      <h1>Funding calls</h1>
      <p className="text-muted">Open and upcoming funding opportunities for ICT, skills and innovation.</p>

      <div className="flex items-center justify-between mt-3 mb-4 flex-wrap gap-2">
        <p className="text-sm text-muted">
          {currentItems.length} active call{currentItems.length === 1 ? "" : "s"}
          {archivedItems.length > 0 ? ` · ${archivedItems.length} closed/past` : ""}
        </p>
        {archivedItems.length > 0 && (
          <Link
            href={showArchive ? "/funding" : "/funding?archive=1"}
            className="text-xs text-g700 underline font-medium"
          >
            {showArchive ? "Show only active opportunities" : `View archive / closed calls (${archivedItems.length}) →`}
          </Link>
        )}
      </div>

      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={`chip text-xs ${
                    item.freshness === "Closing soon"
                      ? "chip-urgent font-semibold"
                      : item.freshness === "Closed" || item.freshness === "Past"
                      ? "opacity-75 bg-slate-100 text-slate-600 border-slate-300"
                      : "chip-active"
                  }`}
                >
                  {item.freshness}
                </span>
                {item.amount && <span className="chip text-xs font-semibold">{item.amount}</span>}
              </div>
              <h2 className="text-lg font-bold">
                <Link href={`/funding/${item.slug}`} className="text-g700 hover:underline">{item.title}</Link>
              </h2>
              <p className="mt-2 text-sm text-[#34413c]">{item.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
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
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/funding/${item.slug}`} className="btn btn-outline text-xs">
                View details →
              </Link>
              {item.url && (
                <a href={item.url} className="btn text-xs" target="_blank" rel="noreferrer">
                  Apply / details
                </a>
              )}
            </div>
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
