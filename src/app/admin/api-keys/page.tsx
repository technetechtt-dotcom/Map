"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

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
      {message && <p className="mb-4 text-sm font-semibold">{message}</p>}
      {secret && (
        <pre className="panel-card mb-6 overflow-x-auto text-sm">{secret}</pre>
      )}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Prefix</th><th>Active</th><th>Last used</th></tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td><code>{k.prefix}</code></td>
                <td>{k.active ? "Yes" : "No"}</td>
                <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
