"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
      <p className="text-muted mb-6 text-sm">
        Demo accounts: admin@ictmap.gov.za · nc.admin@ictmap.gov.za · org@dedat.example<br />
        Password: <code>Admin123!</code>
      </p>
      <form onSubmit={onSubmit} className="panel-card grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">Email
          <input className="field" name="email" type="email" required defaultValue="admin@ictmap.gov.za" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Password
          <input className="field" name="password" type="password" required defaultValue="Admin123!" />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      </form>
    </div>
  );
}
