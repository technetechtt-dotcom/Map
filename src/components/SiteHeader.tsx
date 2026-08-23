"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { useSession, signOut } from "next-auth/react";

const locales: Locale[] = ["en", "af", "xh", "zu"];

export default function SiteHeader({ locale = "en" }: { locale?: string }) {
  const L = (locales.includes(locale as Locale) ? locale : "en") as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  function setLocale(next: string) {
    document.cookie = `locale=${next};path=/;max-age=31536000`;
    router.refresh();
  }

  const nav = [
    { href: "/", label: "Map" },
    { href: "/about", label: t(L, "about") },
    { href: "/organisations", label: "Contacts" },
    { href: "/book", label: "Book" },
    { href: "/national", label: t(L, "national") },
    { href: "/funding", label: t(L, "funding") },
    { href: "/events", label: t(L, "events") },
    { href: "/programmes", label: t(L, "programmes") },
    { href: "/procurement", label: t(L, "procurement") },
    { href: "/submit", label: t(L, "submit") },
    { href: "/rights", label: "Rights" },
    { href: "/dashboard", label: t(L, "dashboard") },
  ];

  return (
    <header className="site-header">
      <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">{t(L, "pilot")}</p>
          <Link href="/" className="block text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {t(L, "brand")}
          </Link>
          <p className="subtitle max-w-2xl text-sm md:text-base">{t(L, "tagline")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-full border border-white/25 bg-white/10 px-3 py-2 text-sm text-white"
            value={L}
            onChange={(e) => setLocale(e.target.value)}
            aria-label="Language"
          >
            <option value="en">English</option>
            <option value="af">Afrikaans</option>
            <option value="xh">isiXhosa</option>
            <option value="zu">isiZulu</option>
          </select>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(session?.user as any)?.role ? (
            <>
              <Link href="/admin" className="secondary-button">{t(L, "admin")}</Link>
              {["SUPER_ADMIN", "PROVINCIAL_ADMIN"].includes(String((session?.user as { role?: string })?.role || "")) && (
                <Link href="/admin/ops" className="secondary-button">Ops</Link>
              )}
              <button type="button" className="secondary-button" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="secondary-button">Sign in</Link>
          )}
        </div>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              pathname === item.href ? "bg-white text-g950" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
