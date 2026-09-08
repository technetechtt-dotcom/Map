"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { requestedPostAuthPath, type AuthPlatform } from "@/lib/auth-navigation";

const showDemoHints = process.env.NEXT_PUBLIC_DEMO_HINTS === "1";
const demoSuperEmail = process.env.NEXT_PUBLIC_DEMO_SUPER_EMAIL || "admin@ictmap.gov.za";
const demoProvincialEmail = process.env.NEXT_PUBLIC_DEMO_PROVINCIAL_EMAIL || "nc.admin@ictmap.gov.za";
const showMfaPrompt =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_MFA_LOGIN !== "0" &&
  process.env.NEXT_PUBLIC_MFA_LOGIN !== "false";
const appPlatform: AuthPlatform =
  process.env.NEXT_PUBLIC_APP_PLATFORM === "ops" ? "ops" : "public";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("created") === "1") {
      setNotice("Account created. Sign in with your new credentials.");
    }
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await signIn("credentials", {
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        mfaCode: String(fd.get("mfaCode") || ""),
        redirect: false,
      });
      if (!res || res.error) {
        setError(
          showMfaPrompt
            ? "Invalid email or password (or MFA code if required)"
            : "Invalid email or password"
        );
        return;
      }

      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
      window.location.assign(requestedPostAuthPath(callbackUrl, appPlatform));
    } catch {
      setError("Could not sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page max-w-md">
      <p className="eyebrow">Secure access</p>
      <h1>Sign in</h1>
      {notice && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {notice}
        </p>
      )}
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
