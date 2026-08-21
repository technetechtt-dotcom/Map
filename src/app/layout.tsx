import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Providers from "@/components/Providers";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "SA ICT Ecosystem Map",
  description:
    "Interactive South African ICT and innovation ecosystem map — Northern Cape public MVP with national expansion.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = cookies().get("locale")?.value || "en";
  return (
    <html lang={locale}>
      <body>
        <Providers>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <SiteHeader locale={locale} />
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/rights">Data rights</a></span>
            <span>SA ICT Ecosystem Platform · Phases 1–4</span>
            <span>Map data © OpenStreetMap contributors · Boundaries: seed envelopes (swap for official MDB layers in production)</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
