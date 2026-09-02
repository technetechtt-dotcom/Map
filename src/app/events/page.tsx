import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const items = (await getEcosystemItems("events")) as Array<{
    id: string;
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
          <article key={item.id} className="panel-card">
            <h2 className="text-lg font-bold">{item.title}</h2>
            <p className="mt-2 text-sm">{item.summary}</p>
            <p className="mt-3 text-sm font-semibold text-g700">
              {new Date(item.startsAt).toLocaleString()}
              {item.endsAt ? ` – ${new Date(item.endsAt).toLocaleString()}` : ""}
            </p>
            {item.venue && <p className="text-sm text-muted">{item.venue}</p>}
            {item.onlineUrl && (
              <a className="text-g700 text-sm" href={item.onlineUrl}>
                {item.onlineUrl}
              </a>
            )}
          </article>
        ))}
        {items.length === 0 && <p className="text-muted">No published events yet.</p>}
      </div>
      <p className="mt-6 text-sm">
        <a className="text-g700 font-semibold" href="/submit?type=events">Submit an event →</a>
      </p>
    </div>
  );
}
