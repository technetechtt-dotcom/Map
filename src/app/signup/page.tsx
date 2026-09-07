"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || "");

    const r = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
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
    if (session?.error) {
      setError("Account created — please sign in.");
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
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
        <p className="text-muted text-xs">At least 12 characters with upper, lower, and a digit.</p>
        <button className="btn" type="submit" disabled={loading}>
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
