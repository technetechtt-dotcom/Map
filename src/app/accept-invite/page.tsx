"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function AcceptInvitePage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/admin/invitations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: fd.get("token") || token,
        name: fd.get("name"),
        password: fd.get("password"),
      }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Account created — you can sign in." : data.error || "Failed");
  }

  return (
    <div className="page max-w-md">
      <p className="eyebrow">Invitation</p>
      <h1>Accept administrator invite</h1>
      <form onSubmit={onSubmit} className="panel-card mt-4 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">
          Invitation token
          <input
            className="field"
            name="token"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Your name
          <input className="field" name="name" required minLength={2} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Choose password (min 12)
          <input className="field" name="password" type="password" required minLength={12} />
        </label>
        <button className="btn" type="submit">
          Create account
        </button>
      </form>
      {msg && <p className="mt-3 text-sm font-semibold text-g700">{msg}</p>}
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-g700 font-semibold">
          Sign in
        </Link>
      </p>
    </div>
  );
}
