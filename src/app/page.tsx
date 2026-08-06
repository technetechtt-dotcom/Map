import { cookies } from "next/headers";
import { Suspense } from "react";
import MapExplorer from "@/components/map/MapExplorer";

export default function HomePage() {
  const locale = cookies().get("locale")?.value || "en";
  return (
    <Suspense fallback={<div className="page">Loading map…</div>}>
      <MapExplorer locale={locale} />
    </Suspense>
  );
}
