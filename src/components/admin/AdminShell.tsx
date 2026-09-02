"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ReactNode } from "react";

const primary = [
  { href: "/admin/ops", label: "Operations", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/admin", label: "Overview", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"] },
  { href: "/admin/locations", label: "Locations", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"] },
  { href: "/admin/submissions", label: "Submissions", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/admin/organisations", label: "Organisations", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN"] },
  { href: "/admin/ecosystem", label: "Ecosystem records", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"] },
  { href: "/admin/review", label: "Review queue", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/admin/data-quality", label: "Data quality", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/admin/audit", label: "Audit log", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/account/security", label: "Security / MFA", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"] },
  { href: "/dashboard", label: "Analytics", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN"] },
];

const advanced = [
  { href: "/admin/imports", label: "Import staging", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/admin/users", label: "Users & roles", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/admin/api-keys", label: "API keys", roles: ["SUPER_ADMIN"] },
  { href: "/admin/synonyms", label: "Search synonyms", roles: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
  { href: "/admin/backups", label: "Backups", roles: ["SUPER_ADMIN"] },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session?.user as any;
  const role = String(user?.role || "");

  if (status === "loading") return <div className="page">Loading…</div>;
  if (!user?.role) {
    return (
      <div className="page">
        <h1>Admin</h1>
        <p className="text-muted">Please <Link className="text-g700 font-semibold" href="/login">sign in</Link> with an administrator account.</p>
      </div>
    );
  }

  const visiblePrimary = primary.filter((l) => l.roles.includes(role));
  const visibleAdvanced = advanced.filter((l) => l.roles.includes(role));

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <p className="eyebrow mb-2">Management</p>
        <p className="mb-4 text-sm font-semibold">{user.name}<br /><span className="text-muted font-normal">{user.role}</span></p>
        {visiblePrimary.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              l.href === "/admin"
                ? pathname === "/admin"
                  ? "active"
                  : ""
                : pathname === l.href || pathname.startsWith(`${l.href}/`)
                  ? "active"
                  : ""
            }
          >
            {l.label}
          </Link>
        ))}
        {visibleAdvanced.length > 0 && (
          <details className="admin-advanced">
            <summary>Advanced</summary>
            {visibleAdvanced.map((l) => (
              <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
                {l.label}
              </Link>
            ))}
          </details>
        )}
      </aside>
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}
