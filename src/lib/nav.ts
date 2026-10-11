export type PublicNavItem = { href: string; label: string };

export const PUBLIC_NAV: PublicNavItem[] = [
  { href: "/", label: "Map" },
  { href: "/search", label: "Search" },
  { href: "/organisations", label: "Organisations" },
  { href: "/national", label: "National" },
  { href: "/funding", label: "Funding" },
  { href: "/events", label: "Events" },
  { href: "/programmes", label: "Programmes" },
  { href: "/procurement", label: "Procurement" },
  { href: "/submit", label: "Submit" },
  { href: "/about", label: "About" },
  { href: "/help", label: "Help" },
];

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/locations/");
  if (href === "/organisations") {
    return pathname === "/organisations" || pathname.startsWith("/organisations/") || pathname.startsWith("/org/");
  }
  if (href === "/funding") return pathname === "/funding" || pathname.startsWith("/funding/");
  if (href === "/events") return pathname === "/events" || pathname.startsWith("/events/");
  if (href === "/programmes") return pathname === "/programmes" || pathname.startsWith("/programmes/");
  if (href === "/procurement") return pathname === "/procurement" || pathname.startsWith("/procurement/");
  if (href === "/national") return pathname === "/national" || pathname.startsWith("/provinces/") || pathname.startsWith("/districts/") || pathname.startsWith("/municipalities/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
