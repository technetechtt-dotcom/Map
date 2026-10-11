import Link from "next/link";

export default function DevelopersPage() {
  return (
    <div className="page max-w-3xl">
      <p className="eyebrow">Platform</p>
      <h1>Developer API</h1>
      <p className="text-muted mb-4">Interactive documentation for the published OpenAPI surface, including search, nearby, matching and catalogue reads.</p>
      <div className="panel-card grid gap-3">
        <p><Link className="text-g700 font-semibold" href="/api/v1/openapi">OpenAPI JSON →</Link></p>
        <p>Public reads: <code>/api/search</code>, <code>/api/nearby</code>, <code>/api/matching</code>, <code>/api/v1/locations</code>.</p>
        <p>Authenticated writes use session or API keys issued from Ops.</p>
        <iframe title="OpenAPI explorer" className="min-h-[480px] w-full rounded-xl border border-line" src="https://unpkg.com/@stoplight/elements@8.0.0/web-components.min.js" hidden />
        <pre className="overflow-x-auto rounded-xl bg-soft p-3 text-xs">{`GET /api/search?q=hub&type=organisation&page=1&sort=relevance
GET /api/nearby?lat=-28.7&lng=24.7&radiusKm=50&kind=location
GET /api/v1/openapi`}</pre>
      </div>
    </div>
  );
}
