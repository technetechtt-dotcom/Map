"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { t, type Locale } from "@/lib/i18n";
import { PUBLIC_NAV, isNavActive } from "@/lib/nav";

const locales: Locale[] = ["en", "af", "xh", "zu"];
const opsAppUrl = (process.env.NEXT_PUBLIC_OPS_APP_URL || "").trim().replace(/\/$/, "");

function AuthControls() {
  const { data: session, status } = useSession();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready || status === "loading") {
    return <div className="flex min-h-[40px] min-w-[8rem] items-center gap-2" aria-hidden />;
  }

  const role = String((session?.user as { role?: string } | undefined)?.role || "");
  if (role) {
    const opsPath = role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN" ? "/admin/ops" : "/admin";
    return (
      <>
        {opsAppUrl ? (
          <a href={`${opsAppUrl}${opsPath}`} className="secondary-button">
            Ops
          </a>
        ) : (
          <Link href={opsPath} className="secondary-button">
            Ops
          </Link>
        )}
        <Link href="/account/notifications" className="secondary-button">
          Account
        </Link>
        <button type="button" className="secondary-button" onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </button>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="secondary-button">
        Sign in
      </Link>
      <Link href="/signup" className="secondary-button">
        Sign up
      </Link>
    </>
  );
}

export default function SiteHeader({ locale = "en" }: { locale?: string }) {
  const L = (locales.includes(locale as Locale) ? locale : "en") as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function setLocale(next: string) {
    document.cookie = `locale=${next};path=/;max-age=31536000`;
    router.refresh();
  }

  const nav = PUBLIC_NAV.map((item) =>
    item.href === "/about" ? { ...item, label: t(L, "about") } : item.href === "/national" ? { ...item, label: t(L, "national") } : item
  );

  return (
    <header className="site-header">
      <div className="flex flex-1 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{t(L, "pilot")}</p>
          <Link href="/" className="block text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {t(L, "brand")}
          </Link>
          <p className="subtitle max-w-2xl text-sm md:text-base">{t(L, "tagline")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="hidden rounded-full border border-white/25 bg-white/10 px-3 py-2 text-sm text-white sm:block"
            value={L}
            onChange={(e) => setLocale(e.target.value)}
            aria-label="Language"
          >
            <option value="en">English</option>
            <option value="af">Afrikaans</option>
            <option value="xh">isiXhosa</option>
            <option value="zu">isiZulu</option>
          </select>
          <div className="hidden items-center gap-2 lg:flex">
            <AuthControls />
          </div>
          <button
            type="button"
            className="hamburger-button lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      <nav className="mt-4 hidden flex-wrap gap-2 border-t border-white/10 pt-3 lg:flex" aria-label="Primary">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              isNavActive(pathname, item.href) ? "bg-white text-g950" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/saved"
          prefetch={false}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            isNavActive(pathname, "/saved") ? "bg-white text-g950" : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          Saved
        </Link>
      </nav>

      {open && (
        <div id="mobile-nav-drawer" className="mobile-nav-drawer lg:hidden" role="dialog" aria-label="Site menu">
          <select
            className="mb-3 w-full rounded-full border border-white/25 bg-white/10 px-3 py-2 text-sm text-white sm:hidden"
            value={L}
            onChange={(e) => setLocale(e.target.value)}
            aria-label="Language"
          >
            <option value="en">English</option>
            <option value="af">Afrikaans</option>
            <option value="xh">isiXhosa</option>
            <option value="zu">isiZulu</option>
          </select>
          <div className="mb-3 flex flex-wrap gap-2">
            <AuthControls />
          </div>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-link ${isNavActive(pathname, item.href) ? "is-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/saved" className={`mobile-nav-link ${isNavActive(pathname, "/saved") ? "is-active" : ""}`}>
            Saved
          </Link>
        </div>
      )}
    </header>
  );
}
