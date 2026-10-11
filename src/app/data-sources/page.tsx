import { prisma } from "@/lib/prisma";
import { CONNECTORS, resolveConnectorHealth } from "@/lib/ingestion/connectors";

export const dynamic = "force-dynamic";

const HEALTH_COPY: Record<string, string> = {
  SEED: "Bundled directory seed — refreshed manually, not a live feed.",
  CONFIGURED: "Live URL configured; waiting for a successful connector run.",
  LIVE: "Refreshed from a configured authoritative feed.",
  DEGRADED: "Configured feed is failing or reporting schema drift.",
  DISABLED: "Intentionally disabled (licence or data-sharing gate).",
};

export default async function DataSourcesPage() {
  const [runs, locations, organisations, funding, events, programmes, procurement] = await Promise.all([
    prisma.ingestionConnectorRun.findMany({ orderBy: { startedAt: "desc" }, take: 80 }),
    prisma.location.count({ where: { status: "PUBLISHED" } }),
    prisma.organisation.count({ where: { status: "PUBLISHED" } }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED" } }),
    prisma.ecosystemEvent.count({ where: { status: "PUBLISHED" } }),
    prisma.programme.count({ where: { status: "PUBLISHED" } }),
    prisma.procurement.count({ where: { status: "PUBLISHED" } }),
  ]);
  const latest = Object.fromEntries(runs.map((run) => [run.connector, run]));
  return (
    <div className="page">
      <p className="eyebrow">Transparency</p>
      <h1>Data sources</h1>
      <p className="text-muted mb-4">
        Authority, licence, retrieval date, and connector health. Government users can distinguish daily live feeds
        from bundled directory seeds.
      </p>
      <div className="stat-grid mb-6">
        <div className="stat"><strong>{locations}</strong><span>Locations</span></div>
        <div className="stat"><strong>{organisations}</strong><span>Organisations</span></div>
        <div className="stat"><strong>{funding + events + programmes + procurement}</strong><span>Opportunities</span></div>
      </div>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Authority</th>
              <th>Licence</th>
              <th>Health</th>
              <th>Retrieved</th>
              <th>Version</th>
              <th>Rows</th>
            </tr>
          </thead>
          <tbody>
            {CONNECTORS.map((connector) => {
              const run = latest[connector.id];
              const health = resolveConnectorHealth(connector, run);
              return (
                <tr key={connector.id}>
                  <td className="font-semibold">{connector.id}</td>
                  <td>{connector.authority}</td>
                  <td>{connector.licence}</td>
                  <td>
                    <span className="chip text-xs" title={HEALTH_COPY[health]}>{health}</span>
                    <div className="text-xs text-muted mt-1 max-w-xs">{HEALTH_COPY[health]}</div>
                  </td>
                  <td>{run?.retrievedAt ? new Date(run.retrievedAt).toLocaleDateString() : "Not yet retrieved"}</td>
                  <td>{run?.sourceVersion || "—"}</td>
                  <td>{run?.rowCount ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
