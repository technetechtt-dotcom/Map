"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import OpsSitesPanel from "@/components/admin/ops/OpsSitesPanel";
import OpsContentPanel from "@/components/admin/ops/OpsContentPanel";
import OpsPeoplePanel from "@/components/admin/ops/OpsPeoplePanel";
import OpsUploadsPanel from "@/components/admin/ops/OpsUploadsPanel";

type DeadLetter = {
  id: string;
  type: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
};

type BackupRow = {
  id: string;
  kind: string;
  filename: string;
  checksumSha256: string | null;
  objectsCopied: number;
  createdAt: string;
  sizeBytes: number;
  status?: string;
  failureReason?: string | null;
  backupRunId?: string | null;
};

type JobRow = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  deadLetter: boolean;
  createdAt: string;
  completedAt: string | null;
};

type Channel = {
  stale: boolean;
  ageHours: number | null;
  filename?: string | null;
  objectsCopied?: number;
  status?: string | null;
  failureReason?: string | null;
};

type OpsSummary = {
  role: string;
  scope: string;
  collectedAt: string;
  health: {
    status: string;
    db: string;
    redis: string;
    dbLatencyMs: number | null;
    maintenance: boolean;
    version: string;
    sha: string | null;
  };
  work: { expiredVerifications: number; openDsar: number; openSubmissions: number; ecosystemDrafts: number };
  catalogue: {
    locations: number;
    organisations: number;
    funding: number;
    events: number;
    programmes: number;
    procurement: number;
  };
  queue: { pending: number; running: number; failed: number; deadLetter: number } | null;
  notifications: { failed: number } | null;
  backup: {
    stale: boolean;
    database: Channel;
    objects: Channel;
    appExport: Channel;
    latestNonSuccessObjects?: { status: string; failureReason: string | null; backupRunId: string | null } | null;
  } | null;
  worker: { healthy?: boolean; workerId?: string; lastSeenAt?: string; queueDepth?: number } | null;
  readiness: {
    nodeEnv: string;
    bootGaps: string[];
    secrets: Record<string, boolean>;
    missingRuntime: string[];
    githubHint: string;
  } | null;
  recentJobs: JobRow[];
  alerts: Record<string, boolean> | null;
  deadLetters: DeadLetter[];
  backups: BackupRow[];
  settings: { maintenance: boolean; envOverride: boolean; message: string | null };
  jobs: string[];
};

const JOB_LABELS: Record<string, string> = {
  expiry: "Expire verification",
  prune: "Prune analytics",
  backup: "Queue backup",
  analytics: "Aggregate analytics",
  cleanup: "Cleanup data",
  notify: "Deliver notifications",
  geocode: "Geocode queue",
  report: "System report",
  ingest: "Ingest national",
  reverify: "Reverify records",
};

function statusClass(status: string) {
  if (status === "ok" || status === "SUCCESS") return "chip chip-active";
  if (status === "FAILED" || status === "error" || status === "degraded") return "chip chip-danger";
  return "chip";
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sites", label: "Sites" },
  { id: "content", label: "Content" },
  { id: "users", label: "Users" },
  { id: "uploads", label: "Uploads" },
  { id: "platform", label: "Platform" },
] as const;

type OpsTab = (typeof TABS)[number]["id"];

function readTab(): OpsTab {
  if (typeof window === "undefined") return "overview";
  const value = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((t) => t.id === value) ? (value as OpsTab) : "overview";
}

export default function OpsDashboardPage() {
  const [tab, setTab] = useState<OpsTab>("overview");
  const [data, setData] = useState<OpsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTab(readTab());
  }, []);

  function selectTab(next: OpsTab) {
    setTab(next);
    const url = next === "overview" ? "/admin/ops" : `/admin/ops?tab=${next}`;
    window.history.replaceState(null, "", url);
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ops/summary", { cache: "no-store" });
    if (res.status === 403) {
      setError("Operations is limited to super and provincial administrators.");
      setData(null);
      return;
    }
    if (!res.ok) {
      setError("Could not load operations snapshot.");
      return;
    }
    setError(null);
    setData((await res.json()) as OpsSummary);
  }, []);

  useEffect(() => {
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await load();
      } catch {
        setError("Could not load operations snapshot.");
      } finally {
        inFlight = false;
      }
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function runJob(job: string, extra = "") {
    setBusy(job);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/jobs?job=${encodeURIComponent(job)}${extra}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Job ${job} failed`);
      const queued = body.results?.queued?.id ? ` queued ${body.results.queued.id}` : "";
      setMessage(`${job}${queued || " completed"}.`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleMaintenance() {
    if (!data || data.settings.envOverride) return;
    setBusy("maintenance");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenance: !data.settings.maintenance }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update maintenance");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const tabBar = (
    <div className="chip-row mb-4" role="tablist" aria-label="Ops console sections">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className={tab === item.id ? "chip chip-active" : "chip"}
          onClick={() => selectTab(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const workPanel =
    tab === "sites" ? (
      <OpsSitesPanel />
    ) : tab === "content" ? (
      <OpsContentPanel />
    ) : tab === "users" ? (
      <OpsPeoplePanel />
    ) : tab === "uploads" ? (
      <OpsUploadsPanel />
    ) : null;

  const heading = (
    <>
      <p className="eyebrow">Platform console</p>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Operations dashboard</h1>
          <p className="text-muted max-w-2xl">
            Upload sites, moderate content, manage users, and run the platform from one desk.
            {data ? ` ${data.scope} snapshot ${new Date(data.collectedAt).toLocaleString()}.` : ""}
          </p>
        </div>
        {data && (
          <span className={statusClass(data.health.status)} aria-live="polite">
            {data.health.status}
          </span>
        )}
      </div>
      {tabBar}
    </>
  );

  if (error && !data && !workPanel) {
    return (
      <AdminShell>
        {heading}
        <p className="text-muted">{error}</p>
        <Link href="/admin" className="btn btn-outline mt-4 inline-block">
          Back to overview
        </Link>
      </AdminShell>
    );
  }

  if (workPanel) {
    return (
      <AdminShell>
        {heading}
        {workPanel}
      </AdminShell>
    );
  }

  if (!data) {
    return (
      <AdminShell>
        {heading}
        <p className="text-muted">Loading live platform status…</p>
      </AdminShell>
    );
  }

  const superAdmin = data.role === "SUPER_ADMIN";
  const missingSecrets = data.readiness?.missingRuntime || [];
  const bootGaps = data.readiness?.bootGaps || [];

  return (
    <AdminShell>
      {heading}
      {message && <p className="mb-4 text-sm font-semibold text-g700">{message}</p>}

      {tab === "overview" && (
      <>
      <div className="stat-grid mb-6">
        <button type="button" className="stat text-left" onClick={() => selectTab("sites")}>
          <strong>{data.catalogue.locations}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Sites</span>
        </button>
        <button type="button" className="stat text-left" onClick={() => selectTab("content")}>
          <strong>{data.work.openSubmissions}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Open submissions</span>
        </button>
        <button type="button" className="stat text-left" onClick={() => selectTab("users")}>
          <strong>Users</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Roles and access</span>
        </button>
        <button type="button" className="stat text-left" onClick={() => selectTab("uploads")}>
          <strong>Uploads</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Files and imports</span>
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <strong>{data.health.db}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Database</span>
        </div>
        {superAdmin && (
          <div className="stat">
            <strong>{data.health.redis}</strong>
            <span className="text-xs uppercase tracking-wide text-muted">Redis</span>
          </div>
        )}
        <div className="stat">
          <strong>
            {data.health.dbLatencyMs ?? "—"}
            {data.health.dbLatencyMs != null ? "ms" : ""}
          </strong>
          <span className="text-xs uppercase tracking-wide text-muted">DB latency</span>
        </div>
        <div className="stat">
          <strong>{data.work.expiredVerifications}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Expired records</span>
        </div>
        <div className="stat">
          <strong>{data.work.openSubmissions}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Open submissions</span>
        </div>
        <div className="stat">
          <strong>{data.work.ecosystemDrafts}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Ecosystem drafts</span>
        </div>
        <div className="stat">
          <strong>{data.work.openDsar}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Open DSAR</span>
        </div>
        {data.queue && (
          <>
            <div className="stat">
              <strong>{data.queue.pending}</strong>
              <span className="text-xs uppercase tracking-wide text-muted">Jobs pending</span>
            </div>
            <div className="stat">
              <strong>{data.queue.deadLetter}</strong>
              <span className="text-xs uppercase tracking-wide text-muted">Dead letters</span>
            </div>
          </>
        )}
      </div>

      <div className="panel-card mt-6">
        <h2 className="mb-3 text-lg font-extrabold">Published catalogue</h2>
        <div className="stat-grid">
          {Object.entries(data.catalogue).map(([key, value]) => (
            <div key={key} className="stat">
              <strong>{value}</strong>
              <span className="text-xs uppercase tracking-wide text-muted">{key}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="font-semibold text-g700" href="/admin/submissions">
            Review submissions →
          </Link>
          <Link className="font-semibold text-g700" href="/admin/ecosystem">
            Ecosystem records →
          </Link>
        </p>
      </div>

      {superAdmin && data.readiness && (
        <div className="panel-card mt-6">
          <h2 className="mb-2 text-lg font-extrabold">Runtime readiness</h2>
          <p className="mb-3 text-sm text-muted">
            Process env for this runtime ({data.readiness.nodeEnv}). {data.readiness.githubHint}
          </p>
          {(bootGaps.length > 0 || missingSecrets.length > 0) && (
            <p className="mb-3 text-sm font-semibold text-red-700">
              {bootGaps.length > 0
                ? `${bootGaps.length} production boot gap(s): ${bootGaps.join(", ")}`
                : `${missingSecrets.length} runtime secret(s) unset.`}
            </p>
          )}
          {bootGaps.length === 0 && missingSecrets.length === 0 && (
            <p className="mb-3 text-sm font-semibold text-g700">Required runtime secrets are present.</p>
          )}
          <div className="ops-secret-grid">
            {Object.entries(data.readiness.secrets).map(([key, present]) => (
              <span key={key} className={present ? "chip chip-active" : "chip chip-danger"}>
                {present ? "set" : "missing"} · {key}
              </span>
            ))}
          </div>
        </div>
      )}

      {superAdmin && data.backup && (
        <div className="panel-card mt-6">
          <h2 className="mb-3 text-lg font-extrabold">Backup channels</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Age (h)</th>
                <th>State</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Database</td>
                <td>{data.backup.database.ageHours?.toFixed(1) ?? "—"}</td>
                <td>
                  <span className={statusClass(data.backup.database.stale ? "degraded" : "ok")}>
                    {data.backup.database.status || (data.backup.database.stale ? "stale" : "fresh")}
                  </span>
                </td>
                <td>{data.backup.database.filename || "—"}</td>
              </tr>
              <tr>
                <td>Objects</td>
                <td>{data.backup.objects.ageHours?.toFixed(1) ?? "—"}</td>
                <td>
                  <span className={statusClass(data.backup.objects.stale ? "degraded" : "ok")}>
                    {data.backup.objects.status || (data.backup.objects.stale ? "stale" : "fresh")}
                  </span>
                </td>
                <td>
                  {data.backup.objects.objectsCopied ?? 0} copied
                  {data.backup.latestNonSuccessObjects?.status
                    ? ` · last non-success ${data.backup.latestNonSuccessObjects.status}`
                    : ""}
                </td>
              </tr>
              <tr>
                <td>App export</td>
                <td>{data.backup.appExport.ageHours?.toFixed(1) ?? "—"}</td>
                <td>{data.backup.appExport.stale ? "stale (supplementary)" : "fresh"}</td>
                <td>Not required for readiness</td>
              </tr>
            </tbody>
          </table>
          <Link href="/admin/backups" className="mt-3 inline-block text-sm font-semibold text-g700">
            Open backup tools →
          </Link>
        </div>
      )}
      </>
      )}

      {tab === "platform" && (
      <>
      {superAdmin && (
        <div className="panel-card mt-6">
          <h2 className="mb-2 text-lg font-extrabold">Runtime</h2>
          <p className="text-sm text-muted">
            Version {data.health.version}
            {data.health.sha ? ` · SHA ${data.health.sha.slice(0, 12)}` : " · SHA unknown"}
            {data.worker ? ` · worker ${data.worker.healthy ? "healthy" : "unhealthy"}` : ""}
            {data.worker?.workerId ? ` (${data.worker.workerId})` : ""}
          </p>
          {data.alerts && (
            <ul className="mt-3 grid gap-1 text-sm">
              {Object.entries(data.alerts).map(([key, on]) => (
                <li key={key} className={on ? "font-semibold text-red-700" : "text-muted"}>
                  {on ? "Alert" : "Clear"} — {key}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="panel-card mt-6">
        <h2 className="mb-3 text-lg font-extrabold">Run a job</h2>
        <div className="flex flex-wrap gap-2">
          {data.jobs.map((job) => (
            <button
              key={job}
              type="button"
              className="btn btn-outline"
              disabled={Boolean(busy)}
              onClick={() => runJob(job)}
            >
              {busy === job ? "Working…" : JOB_LABELS[job] || job}
            </button>
          ))}
        </div>
      </div>

      {superAdmin && data.recentJobs.length > 0 && (
        <div className="panel-card mt-6">
          <h2 className="mb-3 text-lg font-extrabold">Recent jobs</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentJobs.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.type}
                    {row.lastError ? <div className="text-xs text-muted">{row.lastError}</div> : null}
                  </td>
                  <td>
                    <span className={statusClass(row.status === "FAILED" || row.deadLetter ? "FAILED" : row.status === "COMPLETED" ? "ok" : "chip")}>
                      {row.deadLetter ? "DEAD" : row.status}
                    </span>
                  </td>
                  <td>{row.attempts}</td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {superAdmin && (
        <div className="panel-card mt-6">
          <h2 className="mb-2 text-lg font-extrabold">Maintenance</h2>
          <p className="mb-3 text-sm text-muted">
            {data.settings.envOverride
              ? "MAINTENANCE_MODE is forced by environment and cannot be cleared here."
              : data.settings.maintenance
                ? "The public site is in maintenance."
                : "The public site is live."}
          </p>
          {data.settings.message && <p className="mb-3 text-sm">{data.settings.message}</p>}
          <button type="button" className="btn" disabled={Boolean(busy) || data.settings.envOverride} onClick={toggleMaintenance}>
            {data.settings.maintenance ? "End maintenance" : "Start maintenance"}
          </button>
        </div>
      )}

      {superAdmin && data.deadLetters.length > 0 && (
        <div className="panel-card mt-6">
          <h2 className="mb-3 text-lg font-extrabold">Dead letters</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Attempts</th>
                <th>Error</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.deadLetters.map((row) => (
                <tr key={row.id}>
                  <td>{row.type}</td>
                  <td>{row.attempts}</td>
                  <td className="max-w-xs truncate">{row.lastError || "—"}</td>
                  <td>
                    <button type="button" className="btn btn-outline" disabled={Boolean(busy)} onClick={() => runJob("requeue", `&id=${row.id}`)}>
                      Requeue
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {superAdmin && data.backups.length > 0 && (
        <div className="panel-card mt-6">
          <h2 className="mb-3 text-lg font-extrabold">Recent backup records</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Status</th>
                <th>File</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((row) => (
                <tr key={row.id}>
                  <td>{row.kind}</td>
                  <td>
                    <span className={statusClass(row.status || "")}>{row.status || "SUCCESS"}</span>
                  </td>
                  <td>
                    {row.filename}
                    {row.failureReason ? <div className="text-xs text-muted">{row.failureReason}</div> : null}
                  </td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </AdminShell>
  );
}
