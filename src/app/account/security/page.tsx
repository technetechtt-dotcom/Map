"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AccountSecurityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{
    mfaEnabled?: boolean;
    mfaRequired?: boolean;
    secret?: string;
    sampleCode?: string;
    otpauthUrl?: string;
  }>({});

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/auth/mfa")
      .then((r) => r.json())
      .then(setMfa)
      .catch(() => undefined);
  }, []);

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: fd.get("currentPassword"),
        newPassword: fd.get("newPassword"),
      }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? data.message : data.error || "Failed");
  }

  async function setupMfa() {
    const r = await fetch("/api/auth/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(data.error || "MFA setup failed");
      return;
    }
    setMfa((m) => ({
      ...m,
      secret: data.secret,
      sampleCode: data.sampleCode,
      otpauthUrl: data.otpauthUrl,
    }));
    setMsg("Add the secret (or otpauth URI) to your authenticator, then enter the 6-digit code.");
  }

  async function resetMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reset",
        currentPassword: fd.get("currentPassword"),
        existingMfaCode: fd.get("existingMfaCode"),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(data.error || "MFA reset failed");
    setMfa((current) => ({
      ...current,
      secret: data.secret,
      sampleCode: data.sampleCode,
      otpauthUrl: data.otpauthUrl,
    }));
    setMsg("Confirm the replacement secret below. Existing MFA remains active until confirmation.");
  }

  async function disableMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/mfa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "disable",
        password: fd.get("password"),
        existingMfaCode: fd.get("existingMfaCode"),
      }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? "MFA disabled. Sign in again." : data.error || "MFA disable failed");
    if (r.ok) setMfa((current) => ({ ...current, mfaEnabled: false }));
  }

  async function enableMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/mfa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable", code: fd.get("code") }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? "MFA enabled" : data.error || "Failed");
    if (r.ok) setMfa((m) => ({ ...m, mfaEnabled: true }));
  }

  if (status === "loading") return <div className="page">Loading…</div>;

  return (
    <div className="page max-w-lg">
      <p className="eyebrow">Account</p>
      <h1>Security</h1>
      <p className="text-muted text-sm mb-4">
        Signed in as {(session?.user as { email?: string } | undefined)?.email}
        {mfa.mfaRequired && !mfa.mfaEnabled ? " · MFA required for your role" : ""}
      </p>

      <section className="panel-card mb-4 grid gap-3">
        <h2 className="font-bold">Change password</h2>
        <form onSubmit={changePassword} className="grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Current password
            <input className="field" name="currentPassword" type="password" required />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            New password (min 12)
            <input className="field" name="newPassword" type="password" minLength={12} required />
          </label>
          <button className="btn" type="submit">
            Update password
          </button>
        </form>
      </section>

      <section className="panel-card grid gap-3">
        <h2 className="font-bold">Multi-factor authentication</h2>
        <p className="text-sm text-muted">
          Status: {mfa.mfaEnabled ? "Enabled" : "Disabled"}
        </p>
        {!mfa.mfaEnabled && (
          <>
            <button className="btn" type="button" onClick={setupMfa}>
              Start MFA setup
            </button>
            {mfa.secret && (
              <form onSubmit={enableMfa} className="grid gap-3">
                <p className="text-xs break-all">
                  Base32 secret: <code>{mfa.secret}</code>
                  {mfa.otpauthUrl && (
                    <>
                      <br />
                      otpauth: <code className="text-[10px]">{mfa.otpauthUrl}</code>
                    </>
                  )}
                  {mfa.sampleCode && (
                    <>
                      <br />
                      Dev sample code: <code>{mfa.sampleCode}</code>
                    </>
                  )}
                </p>
                <label className="grid gap-1 text-sm font-semibold">
                  Confirmation code
                  <input className="field" name="code" required minLength={6} />
                </label>
                <button className="btn" type="submit">
                  Enable MFA
                </button>
              </form>
            )}
          </>
        )}
        {mfa.mfaEnabled && !mfa.mfaRequired && (
          <div className="grid gap-4">
            <form onSubmit={resetMfa} className="grid gap-3 border-t pt-3">
              <h3 className="font-semibold">Reset MFA</h3>
              <p className="text-xs text-muted">Your existing factor stays active until the replacement is confirmed.</p>
              <input className="field" name="currentPassword" type="password" placeholder="Current password" required />
              <input className="field" name="existingMfaCode" placeholder="Current MFA or recovery code" required />
              <button className="btn" type="submit">Start MFA reset</button>
            </form>
            <form onSubmit={disableMfa} className="grid gap-3 border-t pt-3">
              <h3 className="font-semibold">Disable MFA</h3>
              <input className="field" name="password" type="password" placeholder="Current password" required />
              <input className="field" name="existingMfaCode" placeholder="Current MFA or recovery code" required />
              <button className="btn" type="submit">Disable MFA and revoke sessions</button>
            </form>
          </div>
        )}
        {mfa.mfaEnabled && mfa.secret && (
          <form onSubmit={enableMfa} className="grid gap-3 border-t pt-3">
            <p className="text-xs break-all">Replacement secret: <code>{mfa.secret}</code></p>
            <input className="field" name="code" placeholder="Code from replacement authenticator" required minLength={6} />
            <button className="btn" type="submit">Confirm MFA replacement</button>
          </form>
        )}
      </section>

      {msg && <p className="mt-4 text-sm font-semibold text-g700">{msg}</p>}
      <p className="mt-4 text-sm">
        <Link href="/admin" className="text-g700 font-semibold">
          Admin home
        </Link>
      </p>
    </div>
  );
}
