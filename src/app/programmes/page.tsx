import Link from "next/link";
import { getEcosystemItems } from "@/lib/ecosystem";

export const dynamic = "force-dynamic";

export default async function ProgrammesPage() {
  const items = (await getEcosystemItems("programmes")) as Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    startDate: Date | null;
    endDate: Date | null;
    tags: string[];
  }>;
  return (
    <div className="page">
      <p className="eyebrow">Ecosystem</p>
      <h1>Programmes</h1>
      <p className="text-muted">Skills, youth and sector development programmes.</p>
      <div className="card-grid">
        {items.map((item) => (
          <article key={item.id} className="panel-card flex flex-col justify-between">
            <div>
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
