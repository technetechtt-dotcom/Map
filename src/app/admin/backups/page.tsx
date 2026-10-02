"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";

type BackupRecord = {
  id: string;
  filename: string;
  sizeBytes: number;
  notes?: string | null;
  createdAt: string;
};

export default function AdminBackupsPage() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadBackups() {
    try {
      const res = await fetch("/api/admin/backups");
      if (res.ok) {
        const body = await res.json();
        setBackups(body.backups || []);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadBackups();
  }, []);

  async function runBackup() {
    setLoading(true);
    setResult(null);
    const r = await fetch("/api/admin/backups", { method: "POST" });
    const data = await r.json().catch(() => ({}));
    setLoading(false);
    if (r.ok) {
      setResult(
        `Encrypted backup saved: ${data.backup?.filename} (${data.backup?.sizeBytes} bytes). Super-admin only. Set BACKUP_ENCRYPTION_KEY.`
      );
      await loadBackups();
    } else {
      setResult(data.error || "Backup failed");
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <AdminShell>
      <p className="eyebrow">Resilience</p>
      <h1 className="mb-2 text-2xl font-extrabold">Encrypted backups</h1>
      <p className="text-muted mb-4 max-w-2xl text-sm">
        Super-admin only. Creates an AES-256-GCM encrypted export (no password hashes) under{" "}
        <code>data/backups/*.enc</code>. Download encrypted raw blob or decrypted JSON for inspection.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <button className="btn" type="button" onClick={runBackup} disabled={loading}>
          {loading ? "Creating backup…" : "Create encrypted backup now"}
        </button>
        <button className="btn btn-outline" type="button" onClick={loadBackups}>
          Refresh list
        </button>
      </div>

      {result && <p className="mb-4 font-semibold text-g700">{result}</p>}

      <h2 className="text-lg font-bold mb-3">Backup history</h2>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Size</th>
              <th>Created</th>
              <th>Downloads</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id || b.filename}>
                <td>
                  <code className="text-xs font-semibold">{b.filename}</code>
                  {b.notes && <div className="text-xs text-muted">{b.notes}</div>}
                </td>
                <td className="whitespace-nowrap">{formatBytes(b.sizeBytes)}</td>
                <td className="whitespace-nowrap">{new Date(b.createdAt).toLocaleString()}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <a
                    href={`/api/admin/backups?file=${encodeURIComponent(b.filename)}`}
                    className="chip text-xs hover:bg-black/5"
                    download
                  >
                    Encrypted (.enc)
                  </a>
                  <a
                    href={`/api/admin/backups?file=${encodeURIComponent(b.filename)}&decrypt=1`}
                    className="chip chip-active text-xs"
                    download
                    onClick={(e) => {
                      if (!confirm("Download decrypted plaintext JSON containing database records?")) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Decrypted (.json)
                  </a>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted py-4 text-center">
                  No backups recorded yet. Click &ldquo;Create encrypted backup now&rdquo; above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
