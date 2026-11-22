"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

const cards = [
  { href: "/account/submissions", title: "My submissions", body: "Track organisations, funding, programmes, events and tenders you submitted." },
  { href: "/repository", title: "Innovation Repository", body: "View and securely share stakeholder documents with authorised groups." },
  { href: "/submit", title: "Submit to the ecosystem", body: "Add a new organisation, funding opportunity, event, programme or procurement notice." },
  { href: "/account/notifications", title: "Notifications", body: "Choose how you receive submission, funding, event and programme updates." },
  { href: "/saved", title: "Saved", body: "Return to opportunities and organisations you saved." },
  { href: "/matching", title: "Opportunity matching", body: "See opportunities recommended for your organisation profile." },
  { href: "/account/security", title: "Security & MFA", body: "Manage password and multi-factor authentication." },
];

export default function AccountPage() {
  const { data: session, status } = useSession();
  if (status === "loading") return <div className="page">Loading account…</div>;
  if (!session?.user) {
    return (
      <div className="page max-w-3xl">
        <p className="eyebrow">Stakeholder account</p>
        <h1>Manage your ICT ecosystem contributions</h1>
        <p className="mt-2 text-muted">Sign in to track submissions, respond to Ops review requests and manage your organisation activity.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="btn" href="/login?callbackUrl=%2Faccount">Sign in</Link>
          <Link className="btn btn-outline" href="/signup">Create account</Link>
          <Link className="chip" href="/submit">Submit without an account</Link>
        </div>
      </div>
    );
  }

  const user = session.user as { name?: string | null; email?: string | null; role?: string };
  return (
    <div className="page">
      <p className="eyebrow">Stakeholder dashboard</p>
      <h1>{user.name ? `Welcome, ${user.name}` : "Your account"}</h1>
      <p className="text-muted mb-6">Manage contributions to the SA ICT Ecosystem Map and follow every submission from review to publication.</p>
      <div className="card-grid">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="panel-card block hover:border-g500">
            <h2 className="text-lg font-bold text-g700">{card.title}</h2>
            <p className="mt-2 text-sm text-muted">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
