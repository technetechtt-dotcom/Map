import Link from "next/link";
import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function ProgrammesPage({
  searchParams,
}: {
  searchParams?: Promise<{ archive?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const showArchive = sp.archive === "1";
  const allItems = (await getEcosystemItems("programmes")) as Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    startDate: Date | null;
    endDate: Date | null;
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
      <h1>Programmes</h1>
      <p className="text-muted">Skills, youth and sector development programmes.</p>

      <div className="flex items-center justify-between mt-3 mb-4 flex-wrap gap-2">
        <p className="text-sm text-muted">
          {currentItems.length} active programme{currentItems.length === 1 ? "" : "s"}
          {archivedItems.length > 0 ? ` · ${archivedItems.length} concluded/past` : ""}
        </p>
        {archivedItems.length > 0 && (
          <Link
            href={showArchive ? "/programmes" : "/programmes?archive=1"}
            className="text-xs text-g700 underline font-medium"
          >
            {showArchive ? "Show only active programmes" : `View past programmes archive (${archivedItems.length}) →`}
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
                      : item.freshness === "Past" || item.freshness === "Closed"
                      ? "opacity-75 bg-slate-100 text-slate-600 border-slate-300"
                      : "chip-active font-semibold"
                  }`}
                >
                  {item.freshness}
                </span>
              </div>
              <h2 className="text-lg font-bold">
                <Link href={`/programmes/${item.slug}`} className="text-g700 hover:underline">
                  {item.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-[#34413c]">{item.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.startDate && (
                  <span className="chip">
                    Starts {new Date(item.startDate).toLocaleDateString()}
                  </span>
                )}
                {item.endDate && (
                  <span className="chip">
                    Ends {new Date(item.endDate).toLocaleDateString()}
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
              <Link href={`/programmes/${item.slug}`} className="btn btn-outline text-xs">
                View details →
              </Link>
            </div>
          </article>
        ))}
        {items.length === 0 && <p className="text-muted">No published programmes yet.</p>}
      </div>
      <p className="mt-6 text-sm">
        <Link className="text-g700 font-semibold" href="/submit?type=programmes">
          Submit a programme →
        </Link>
      </p>
    </div>
  );
}
