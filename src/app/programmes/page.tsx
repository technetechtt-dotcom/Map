import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function ProgrammesPage() {
  const items = (await getEcosystemItems("programmes")) as Array<{
    id: string;
    title: string;
    summary: string;
    startDate: Date | null;
    tags: string[];
  }>;
  return (
    <div className="page">
      <p className="eyebrow">Ecosystem</p>
      <h1>Programmes</h1>
      <p className="text-muted">Skills, youth and sector development programmes.</p>
      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel-card">
            <h2 className="text-lg font-bold">{item.title}</h2>
            <p className="mt-2 text-sm">{item.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.startDate && (
                <span className="chip">
                  Starts {new Date(item.startDate).toLocaleDateString()}
                </span>
              )}
              {(item.tags || []).map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
        {items.length === 0 && <p className="text-muted">No published programmes yet.</p>}
      </div>
      <p className="mt-6 text-sm">
        <a className="text-g700 font-semibold" href="/submit?type=programmes">Submit a programme →</a>
      </p>
    </div>
  );
}
