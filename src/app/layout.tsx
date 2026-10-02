import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import "./globals.css";
import Providers from "@/components/Providers";
import SiteHeader from "@/components/SiteHeader";
import OpsChrome from "@/components/OpsChrome";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_PILOT_LINE } from "@/lib/brand";
import { getAppPlatform } from "@/lib/platform";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_DESCRIPTION,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await cookies()).get("locale")?.value || "en";
  const platform = getAppPlatform();

  if (platform === "ops") {
    return (
      <html lang={locale} suppressHydrationWarning>
        <body suppressHydrationWarning>
          <Providers>
            <a href="#main-content" className="skip-link">
              Skip to content
            </a>
            <OpsChrome />
            <main id="main-content">{children}</main>
          </Providers>
        </body>
      </html>
    );
  }

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <SiteHeader locale={locale} />
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <span>
              <Link href="/about">About</Link> · <Link href="/national">National</Link> · <Link href="/organisations">Contacts</Link> · <Link href="/saved">Saved</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/rights">Data rights</Link>
            </span>
            <span>
              {PRODUCT_NAME} · {PRODUCT_PILOT_LINE}
            </span>
            <span>
              Map tiles © OpenStreetMap contributors. Northern Cape districts and municipalities use
              Municipal Demarcation Board geometry where published; other provinces use generalised
              envelopes.
            </span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
