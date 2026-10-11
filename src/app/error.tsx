"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page max-w-xl">
      <p className="eyebrow">SA ICT Ecosystem Map</p>
      <h1>Something went wrong</h1>
      <p className="text-muted">The page failed to load. Retry, or return to the map while we keep your session intact.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => reset()}>Retry</button>
        <Link className="btn btn-outline" href="/">Home</Link>
        <Link className="btn btn-outline" href="/contact">Contact support</Link>
      </div>
    </div>
  );
}
