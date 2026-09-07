"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const showDemoHints = process.env.NEXT_PUBLIC_DEMO_HINTS === "1";
const demoSuperEmail = process.env.NEXT_PUBLIC_DEMO_SUPER_EMAIL || "admin@ictmap.gov.za";
const demoProvincialEmail = process.env.NEXT_PUBLIC_DEMO_PROVINCIAL_EMAIL || "nc.admin@ictmap.gov.za";
const showMfaPrompt =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_MFA_LOGIN !== "0" &&
  process.env.NEXT_PUBLIC_MFA_LOGIN !== "false";
const opsAppUrl = (process.env.NEXT_PUBLIC_OPS_APP_URL || "").replace(/\/$/, "");

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
      setError(showMfaPrompt ? "Invalid email or password (or MFA code if required)" : "Invalid email or password");
      return;
    }
    try {
      const me = await fetch("/api/auth/mfa").then((r) => r.json());
      if (me?.mustChangePassword) {
        router.push("/account/security?force=1");
        router.refresh();
        return;
      }
      const role = String(me?.role || "");
      const staffHome =
        role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN"
          ? "/admin/ops"
          : role === "ORG_ADMIN" || role === "CONTRIBUTOR"
            ? "/admin"
            : null;

      if (staffHome) {
        if (opsAppUrl && window.location.origin !== opsAppUrl) {
          window.location.href = `${opsAppUrl}${staffHome}`;
          return;
        }
        router.push(staffHome);
      } else {
        router.push("/");
      }
    } catch {
      router.push("/");
    }
    router.refresh();
  }

  return (
    <div className="page max-w-md">
      <p className="eyebrow">Secure access</p>
      <h1>Sign in</h1>
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
          Sign in on the public map or ops console. Both share the same database — published sites
          appear on the map. Session lasts 8 hours.
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
        <label
          className={showMfaPrompt ? "grid gap-1 text-sm font-semibold" : "absolute -left-[9999px] h-0 w-0 overflow-hidden"}
          aria-hidden={!showMfaPrompt}
        >
          MFA code {showMfaPrompt ? "(if enabled)" : ""}
          <input className="field" name="mfaCode" autoComplete="one-time-code" tabIndex={showMfaPrompt ? 0 : -1} />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <p className="text-sm">
          <Link href="/signup" className="text-g700 font-semibold">
            Create an account
          </Link>
          {" · "}
          <Link href="/reset-password" className="text-g700 font-semibold">
            Forgot password?
          </Link>
        </p>
      </form>
    </div>
  );
}
