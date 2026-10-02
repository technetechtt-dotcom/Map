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
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);

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
    setCopied(false);
    setMessage("API key created — copy the secret now; it will not be shown again.");
    await load();
  }

  async function rotateKey(keyToRotate: KeyRow) {
    if (!confirm(`Rotate API key "${keyToRotate.name}"? A new secret will be generated and the existing key will immediately stop working.`)) return;
    setRotatingId(keyToRotate.id);
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${keyToRotate.name} (rotated)`,
        scopes: ["locations:read", "organisations:read", "ecosystem:read"],
        rateLimit: keyToRotate.rateLimit,
        rotateId: keyToRotate.id,
      }),
    });
    setRotatingId(null);
    const body = await res.json();
    if (!res.ok) {
      setMessage(body.error || "Failed to rotate key");
      return;
    }
    setSecret(body.secret || null);
    setCopied(false);
    setMessage(`API key rotated successfully. Copy the new secret now.`);
    await load();
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
    }
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
          <input className="field" name="name" required minLength={3} placeholder="e.g. Provincial Analytics Partner" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Rate limit / hour
          <input className="field" name="rateLimit" type="number" defaultValue={600} min={10} max={10000} />
        </label>
        <button className="btn" type="submit">Create key</button>
      </form>

      {message && <p className="mb-4 text-sm font-semibold text-g700">{message}</p>}

      {secret && (
        <div className="panel-card mb-6 border-2 border-amber-400 bg-amber-50">
          <p className="font-bold text-sm mb-1 text-amber-900">New API Key Secret (shown once only):</p>
          <p className="text-xs text-amber-700 mb-3">Save this key in your secure password manager or environment secrets store. You will not be able to retrieve it again.</p>
          <div className="flex items-center gap-2">
            <pre className="flex-1 overflow-x-auto text-sm font-mono bg-white p-3 rounded border border-amber-200">{secret}</pre>
            <button
              type="button"
              className="btn btn-outline text-xs whitespace-nowrap"
              onClick={copySecret}
            >
              {copied ? "✓ Copied to clipboard" : "📋 Copy to clipboard"}
            </button>
          </div>
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
              <th>Expires</th>
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
                <td className="text-xs text-muted">
                  {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never"}
                </td>
                <td className="text-xs text-muted">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                </td>
                <td>
                  {k.active ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="chip text-xs hover:bg-amber-50 hover:text-amber-700"
                        onClick={() => rotateKey(k)}
                        disabled={rotatingId === k.id}
                      >
                        {rotatingId === k.id ? "Rotating…" : "Rotate"}
                      </button>
                      <button
                        type="button"
                        className="chip text-xs hover:bg-red-50 hover:text-red-700"
                        onClick={() => revoke(k.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  ) : (
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted py-4 text-center">No API keys issued yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
