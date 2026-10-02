"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopesJson: string;
  rateLimit: number;
  active: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/api-keys");
    if (res.ok) {
      const body = await res.json();
      setKeys(body.keys || []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name")),
        scopes: ["locations:read", "organisations:read", "ecosystem:read"],
        rateLimit: Number(fd.get("rateLimit") || 600),
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setMessage(body.error || "Failed");
      return;
    }
    setSecret(body.secret || null);
    setMessage("API key created — copy the secret now; it will not be shown again.");
    await load();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this API key? Client requests using this key will be rejected immediately.")) return;
    const res = await fetch("/api/admin/api-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "API key revoked." : body.error || "Failed to revoke key");
    await load();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Platform</p>
      <h1>API keys</h1>
      <p className="text-muted mb-6">Issue scoped read keys for partner integrations.</p>
      <form onSubmit={create} className="panel-card mb-6 grid max-w-lg gap-3">
        <label className="grid gap-1 text-sm font-semibold">
          Name
          <input className="field" name="name" required minLength={3} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Rate limit / hour
          <input className="field" name="rateLimit" type="number" defaultValue={600} min={10} max={10000} />
        </label>
        <button className="btn" type="submit">Create key</button>
      </form>
      {message && <p className="mb-4 text-sm font-semibold text-g700">{message}</p>}
      {secret && (
        <div className="panel-card mb-6">
          <p className="font-bold text-sm mb-2 text-red-700">New API Key Secret (shown once only):</p>
          <pre className="overflow-x-auto text-sm font-mono bg-g100 p-3 rounded">{secret}</pre>
        </div>
      )}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Status</th>
              <th>Rate limit</th>
              <th>Last used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="font-semibold">{k.name}</td>
                <td><code>{k.prefix}…</code></td>
                <td>
                  <span className={k.active ? "chip chip-active" : "chip"}>
                    {k.active ? "Active" : "Revoked"}
                  </span>
                </td>
                <td>{k.rateLimit}/hr</td>
                <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</td>
                <td>
                  {k.active ? (
                    <button
                      type="button"
                      className="chip text-xs hover:bg-red-50 hover:text-red-700"
                      onClick={() => revoke(k.id)}
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted py-4 text-center">No API keys issued yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
