"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const showDemoHints = process.env.NEXT_PUBLIC_DEMO_HINTS === "1";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="page max-w-md">
      <p className="eyebrow">Secure access</p>
      <h1>Administrator login</h1>
      {showDemoHints ? (
        <p className="text-muted mb-6 text-sm">
          Local demo hints enabled. Seed with <code>ALLOW_DEMO_USERS=1</code> and a strong{" "}
          <code>SEED_ADMIN_PASSWORD</code>.
        </p>
      ) : (
        <p className="text-muted mb-6 text-sm">
          Use credentials issued by your platform administrator. Session lasts 8 hours.
        </p>
      )}
      <form onSubmit={onSubmit} className="panel-card grid gap-3" autoComplete="on">
        <label className="grid gap-1 text-sm font-semibold">
          Email
          <input className="field" name="email" type="email" required autoComplete="username" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Password
          <input
            className="field"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      </form>
    </div>
  );
}
