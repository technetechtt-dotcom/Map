import Link from "next/link";
import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const items = (await getEcosystemItems("events")) as Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    startsAt: Date;
    endsAt: Date | null;
    venue: string | null;
    onlineUrl: string | null;
  }>;
  return (
    <div className="page">
      <p className="eyebrow">Ecosystem</p>
      <h1>Events</h1>
      <p className="text-muted">Innovation weeks, industry days and ecosystem networking.</p>
      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel-card flex flex-col justify-between">
            <div>
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
