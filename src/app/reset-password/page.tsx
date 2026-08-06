"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<"request" | "complete">("request");

  async function requestReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.get("email") }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(data.message || data.error || "Request submitted");
    if (data.devToken) {
      setToken(data.devToken);
      setMode("complete");
    }
  }

  async function completeReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/password-reset", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: fd.get("token") || token,
        password: fd.get("password"),
      }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Password updated — you can sign in." : data.error || "Failed");
  }

  return (
    <div className="page max-w-md">
      <p className="eyebrow">Account</p>
      <h1>Password reset</h1>
      {mode === "request" ? (
        <form onSubmit={requestReset} className="panel-card mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Account email
            <input className="field" name="email" type="email" required />
          </label>
          <button className="btn" type="submit">
            Send reset link
          </button>
        </form>
      ) : (
        <form onSubmit={completeReset} className="panel-card mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Reset token
            <input className="field" name="token" required defaultValue={token} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            New password (min 12)
            <input className="field" name="password" type="password" minLength={12} required />
          </label>
          <button className="btn" type="submit">
            Set password
          </button>
        </form>
      )}
      {msg && <p className="mt-3 text-sm font-semibold text-g700">{msg}</p>}
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-g700 font-semibold">
          Back to login
        </Link>
      </p>
    </div>
  );
}
