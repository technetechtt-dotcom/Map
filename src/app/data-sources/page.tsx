import { prisma } from "@/lib/prisma";
import { CONNECTORS } from "@/lib/ingestion/connectors";

export const dynamic = "force-dynamic";

export default async function DataSourcesPage() {
  const [runs, locations, organisations, funding, events, programmes, procurement] = await Promise.all([
    prisma.ingestionConnectorRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 }),
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
      <p className="text-muted mb-4">Authority, licence, retrieval date, last verification and published record counts for national connectors.</p>
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
              <th>Licence</th>
              <th>Retrieved</th>
              <th>Version</th>
              <th>Rows</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {CONNECTORS.map((connector) => {
              const run = latest[connector.id];
              return (
                <tr key={connector.id}>
                  <td className="font-semibold">{connector.id}</td>
                  <td>{connector.licence}</td>
                  <td>{run?.retrievedAt ? new Date(run.retrievedAt).toLocaleDateString() : "Not yet retrieved"}</td>
                  <td>{run?.sourceVersion || "—"}</td>
                  <td>{run?.rowCount ?? 0}</td>
                  <td>{run?.status || "planned"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
