"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const showDemoHints = process.env.NEXT_PUBLIC_DEMO_HINTS === "1";
const demoSuperEmail = process.env.NEXT_PUBLIC_DEMO_SUPER_EMAIL || "admin@ictmap.gov.za";
const demoProvincialEmail = process.env.NEXT_PUBLIC_DEMO_PROVINCIAL_EMAIL || "nc.admin@ictmap.gov.za";

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
      mfaCode: String(fd.get("mfaCode") || ""),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password (or MFA code if required)");
      return;
    }
    try {
      const me = await fetch("/api/auth/mfa").then((r) => r.json());
      if (me?.mustChangePassword) {
        router.push("/account/security?force=1");
        router.refresh();
        return;
      }
    } catch {
      // fall through
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="page max-w-md">
      <p className="eyebrow">Secure access</p>
      <h1>Administrator login</h1>
      {showDemoHints ? (
        <div className="panel-card mb-6 text-sm">
          <p className="font-semibold">Local presentation logins</p>
          <p className="text-muted mt-1">
            Seeded when <code>ALLOW_DEMO_USERS=1</code> or <code>SEED_ADMIN_PASSWORD</code> is set.
            Use that same password for both accounts. Never enable this in production.
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              Super admin — <code>{demoSuperEmail}</code>
            </li>
            <li>
              Northern Cape provincial — <code>{demoProvincialEmail}</code>
            </li>
          </ul>
        </div>
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
        <label className="grid gap-1 text-sm font-semibold">
          MFA code (if enabled)
          <input className="field" name="mfaCode" autoComplete="one-time-code" />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <p className="text-sm">
          <a href="/reset-password" className="text-g700 font-semibold">
            Forgot password?
          </a>
        </p>
      </form>
    </div>
  );
}
