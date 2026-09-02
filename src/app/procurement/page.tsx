import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function ProcurementPage() {
  const items = (await getEcosystemItems("procurement")) as Array<{
    id: string;
    title: string;
    summary: string;
    closingDate: Date | null;
    budget: string | null;
    url: string | null;
  }>;
  return (
    <div className="page">
      <p className="eyebrow">Ecosystem</p>
      <h1>Procurement</h1>
      <p className="text-muted">Open tenders and RFPs linked to digital and ICT delivery.</p>
      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel-card">
            <h2 className="text-lg font-bold">{item.title}</h2>
            <p className="mt-2 text-sm">{item.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.budget && <span className="chip chip-active">{item.budget}</span>}
              {item.closingDate && (
                <span className="chip">
                  Closes {new Date(item.closingDate).toLocaleDateString()}
                </span>
              )}
            </div>
            {item.url && (
              <a href={item.url} className="btn mt-4" target="_blank" rel="noreferrer">
                View tender
              </a>
            )}
          </article>
        ))}
        {items.length === 0 && <p className="text-muted">No published tenders yet.</p>}
      </div>
      <p className="mt-6 text-sm">
        <a className="text-g700 font-semibold" href="/submit?type=procurement">Submit a tender notice →</a>
      </p>
    </div>
  );
}
