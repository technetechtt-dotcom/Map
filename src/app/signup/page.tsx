"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { defaultPostAuthPath, type AuthPlatform } from "@/lib/auth-navigation";

type Province = { id: string; slug: string; name: string; code: string };

const appPlatform: AuthPlatform =
  process.env.NEXT_PUBLIC_APP_PLATFORM === "ops" ? "ops" : "public";
const defaultProvince = process.env.NEXT_PUBLIC_DEFAULT_PROVINCE || "northern-cape";

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [provinces, setProvinces] = useState<Province[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/meta", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load provinces");
        return response.json();
      })
      .then((data) => {
        if (active) setProvinces(Array.isArray(data.provinces) ? data.provinces : []);
      })
      .catch(() => {
        if (active) setError("Could not load provinces. Refresh the page to try again.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    const name = String(fd.get("name") || "");
    const provinceId = String(fd.get("provinceId") || "");

    if (password !== confirmPassword) {
      setLoading(false);
      setError("Passwords do not match");
      return;
    }

    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, provinceId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLoading(false);
        setError(data.error || "Could not create account");
        return;
      }

      const session = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      setLoading(false);
      if (!session || session.error) {
        setError("Account created — please sign in.");
        window.location.assign("/login?created=1");
        return;
      }
      window.location.assign(defaultPostAuthPath(appPlatform, "CONTRIBUTOR"));
    } catch {
      setLoading(false);
      setError("Could not create account. Check your connection and try again.");
    }
  }

  return (
    <div className="page max-w-md">
      <p className="eyebrow">Create account</p>
      <h1>Sign up</h1>
      <p className="text-muted mb-6 text-sm">
        Create a contributor account on the shared platform database. After signup you can sign in
        on the public map or the ops console.
      </p>
      <form onSubmit={onSubmit} className="panel-card grid gap-3" autoComplete="on">
        <label className="grid gap-1 text-sm font-semibold">
          Full name
          <input className="field" name="name" type="text" required minLength={2} autoComplete="name" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Email
          <input className="field" name="email" type="email" required autoComplete="username" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Province
          <select
            className="field"
            name="provinceId"
            required
            defaultValue={provinces.find((province) => province.slug === defaultProvince)?.id || ""}
            key={provinces.length ? "loaded" : "loading"}
          >
            <option value="" disabled>
              {provinces.length ? "Select a province" : "Loading provinces..."}
            </option>
            {provinces.map((province) => (
              <option key={province.id} value={province.id}>
                {province.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Password
          <input
            className="field"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Confirm password
          <input
            className="field"
            name="confirmPassword"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </label>
        <p className="text-muted text-xs">At least 12 characters with upper, lower, and a digit.</p>
        <button className="btn" type="submit" disabled={loading || provinces.length === 0}>
          {loading ? "Creating…" : "Create account"}
        </button>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <p className="text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-g700 font-semibold">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
