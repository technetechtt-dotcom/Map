"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";

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
  work: { expiredVerifications: number; openDsar: number; openSubmissions: number };
  queue: { pending: number; running: number; failed: number; deadLetter: number } | null;
  notifications: { failed: number } | null;
  backup: {
    stale: boolean;
    database: { stale: boolean; ageHours: number | null; filename: string | null };
    objects: { stale: boolean; ageHours: number | null; objectsCopied: number };
    appExport: { stale: boolean; ageHours: number | null };
  } | null;
  worker: { healthy?: boolean; workerId?: string; lastSeenAt?: string; queueDepth?: number } | null;
  alerts: Record<string, boolean> | null;
  deadLetters: DeadLetter[];
  backups: BackupRow[];
  settings: { maintenance: boolean; envOverride: boolean; message: string | null };
  jobs: string[];
};

function statusClass(status: string) {
  if (status === "ok") return "chip chip-active";
  if (status === "maintenance") return "chip";
  return "chip";
}

export default function OpsDashboardPage() {
  const [data, setData] = useState<OpsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    load().catch(() => setError("Could not load operations snapshot."));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function runJob(job: string, extra = "") {
    setBusy(job);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/jobs?job=${encodeURIComponent(job)}${extra}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Job ${job} failed`);
      setMessage(`${job} queued or completed.`);
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

  if (error && !data) {
    return (
      <AdminShell>
        <h1 className="text-2xl font-extrabold">Operations</h1>
        <p className="text-muted">{error}</p>
        <Link href="/admin" className="btn btn-outline mt-4 inline-block">Back to overview</Link>
      </AdminShell>
    );
  }

  if (!data) {
    return (
      <AdminShell>
        <p className="eyebrow">Backend</p>
        <h1 className="text-2xl font-extrabold">Operations</h1>
        <p className="text-muted">Loading live platform status…</p>
      </AdminShell>
    );
  }

  const superAdmin = data.role === "SUPER_ADMIN";

  return (
    <AdminShell>
      <p className="eyebrow">Backend</p>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Operations dashboard</h1>
          <p className="text-muted max-w-2xl">
            Live health, queues, backups and maintenance for the {data.scope} scope. Snapshot {new Date(data.collectedAt).toLocaleString()}.
          </p>
        </div>
        <span className={statusClass(data.health.status)} aria-live="polite">
          {data.health.status}
        </span>
      </div>

      {message && <p className="mb-4 text-sm font-semibold text-g700">{message}</p>}

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
          <strong>{data.health.dbLatencyMs ?? "—"}{data.health.dbLatencyMs != null ? "ms" : ""}</strong>
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
                <td>{data.backup.database.stale ? "stale" : "fresh"}</td>
                <td>{data.backup.database.filename || "—"}</td>
              </tr>
              <tr>
                <td>Objects</td>
                <td>{data.backup.objects.ageHours?.toFixed(1) ?? "—"}</td>
                <td>{data.backup.objects.stale ? "stale" : "fresh"}</td>
                <td>{data.backup.objects.objectsCopied} copied</td>
              </tr>
              <tr>
                <td>App export</td>
                <td>{data.backup.appExport.ageHours?.toFixed(1) ?? "—"}</td>
                <td>{data.backup.appExport.stale ? "stale (supplementary)" : "fresh"}</td>
                <td>Not required for readiness</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

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
              {busy === job ? "Working…" : job}
            </button>
          ))}
        </div>
      </div>

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
                <th>File</th>
                <th>Copied</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((row) => (
                <tr key={row.id}>
                  <td>{row.kind}</td>
                  <td>{row.filename}</td>
                  <td>{row.objectsCopied}</td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/admin/backups" className="mt-3 inline-block text-sm font-semibold text-g700">
            Open backup tools →
          </Link>
        </div>
      )}
    </AdminShell>
  );
}
