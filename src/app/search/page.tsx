import Link from "next/link";
import { searchCatalog } from "@/lib/search";

export const dynamic = "force-dynamic";

const TYPES = ["all", "location", "organisation", "funding", "event", "programme", "procurement"] as const;
const SORTS = ["relevance", "title", "newest"] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const q = (sp.q || "").trim();
  const type = TYPES.includes((sp.type || "all") as (typeof TYPES)[number]) ? (sp.type || "all") : "all";
  const sort = SORTS.includes((sp.sort || "relevance") as (typeof SORTS)[number]) ? (sp.sort || "relevance") : "relevance";
  const page = Math.max(1, Number(sp.page || 1) || 1);
  const province = sp.province || "";
  const data = q.length >= 2
    ? await searchCatalog({ q, type, sort, page, limit: 12, province })
    : { results: [], suggestions: [], total: 0, pages: 1 };
  const href = (next: Record<string, string | number>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type !== "all") params.set("type", type);
    if (sort !== "relevance") params.set("sort", sort);
    if (province) params.set("province", province);
    Object.entries(next).forEach(([k, v]) => params.set(k, String(v)));
    return `/search?${params.toString()}`;
  };
  const kindHref = (kind: string, slug: string) => {
    if (kind === "organisation") return `/org/${slug}`;
    if (kind === "location") return `/locations/${slug}`;
    if (kind === "event") return `/events/${slug}`;
    if (kind === "programme") return `/programmes/${slug}`;
    return `/${kind}/${slug}`;
  };

  return (
    <div className="page">
      <p className="eyebrow">Catalogue</p>
      <h1>Search</h1>
      <p className="text-muted mb-4">Shareable search across locations, organisations, funding, events, programmes and procurement. Synonyms and typo-tolerant matching are included.</p>
      <form method="get" className="panel-card mb-5 grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold md:col-span-2">
          Query
          <input className="field" name="q" defaultValue={q} minLength={2} required placeholder="Hub, funder, town, tender…" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Type
          <select className="field" name="type" defaultValue={type}>
            {TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Sort
          <select className="field" name="sort" defaultValue={sort}>
            {SORTS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Province
          <input className="field" name="province" defaultValue={province} placeholder="northern-cape" />
        </label>
        <div className="flex items-end">
          <button className="btn" type="submit">Search</button>
        </div>
      </form>
      {data.suggestions.length > 0 && (
        <p className="mb-3 text-sm text-muted">Also matching: {data.suggestions.join(", ")}</p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((item) => (
          <Link key={item} href={href({ type: item, page: 1 })} className={`chip ${type === item ? "chip-active" : ""}`}>{item}</Link>
        ))}
      </div>
      <div className="card-grid">
        {data.results.map((row) => (
          <article key={`${row.kind}-${row.slug}`} className="panel-card">
            <p className="chip text-xs">{row.kind}</p>
            <h2 className="mt-2 text-lg font-bold"><Link className="text-g700" href={kindHref(row.kind, row.slug)}>{row.title}</Link></h2>
            <p className="mt-2 text-sm text-muted">{row.summary}</p>
          </article>
        ))}
        {q.length >= 2 && data.results.length === 0 && <p className="text-muted">No catalogue matches.</p>}
      </div>
      {q.length >= 2 && (
        <div className="mt-6 flex gap-2">
          {page > 1 && <Link className="chip" href={href({ page: page - 1 })}>Previous</Link>}
          <span className="chip">Page {page} of {data.pages}</span>
          {page < data.pages && <Link className="chip" href={href({ page: page + 1 })}>Next</Link>}
        </div>
      )}
    </div>
  );
}
