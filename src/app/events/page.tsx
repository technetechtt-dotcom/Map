import Link from "next/link";
import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<{ archive?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const showArchive = sp.archive === "1";
  const allItems = (await getEcosystemItems("events")) as Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    startsAt: Date;
    endsAt: Date | null;
    venue: string | null;
    onlineUrl: string | null;
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
      <h1>Events</h1>
      <p className="text-muted">Innovation weeks, industry days and ecosystem networking.</p>

      <div className="flex items-center justify-between mt-3 mb-4 flex-wrap gap-2">
        <p className="text-sm text-muted">
          {currentItems.length} upcoming/current event{currentItems.length === 1 ? "" : "s"}
          {archivedItems.length > 0 ? ` · ${archivedItems.length} past` : ""}
        </p>
        {archivedItems.length > 0 && (
          <Link
            href={showArchive ? "/events" : "/events?archive=1"}
            className="text-xs text-g700 underline font-medium"
          >
            {showArchive ? "Show only upcoming events" : `View past events archive (${archivedItems.length}) →`}
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
                    item.freshness === "Upcoming"
                      ? "chip-active font-semibold"
                      : item.freshness === "Ongoing"
                      ? "chip-urgent font-semibold"
                      : "opacity-75 bg-slate-100 text-slate-600 border-slate-300"
                  }`}
                >
                  {item.freshness}
                </span>
              </div>
              <h2 className="text-lg font-bold">
                <Link href={`/events/${item.slug}`} className="text-g700 hover:underline">
                  {item.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-[#34413c]">{item.summary}</p>
              <p className="mt-3 text-sm font-semibold text-g700">
                {new Date(item.startsAt).toLocaleString()}
                {item.endsAt ? ` – ${new Date(item.endsAt).toLocaleString()}` : ""}
              </p>
              {item.venue && <p className="mt-1 text-sm text-muted">{item.venue}</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/events/${item.slug}`} className="btn btn-outline text-xs">
                View details →
              </Link>
              {item.onlineUrl && (
                <a className="btn text-xs" href={item.onlineUrl} target="_blank" rel="noreferrer">
                  Join online
                </a>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && <p className="text-muted">No published events yet.</p>}
      </div>
      <p className="mt-6 text-sm">
        <Link className="text-g700 font-semibold" href="/submit?type=events">
          Submit an event →
        </Link>
      </p>
    </div>
  );
}
