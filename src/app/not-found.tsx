import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page max-w-xl">
      <p className="eyebrow">SA ICT Ecosystem Map</p>
      <h1>Page not found</h1>
      <p className="text-muted">That public page does not exist or has been archived. Try search, the map, or the national dashboard.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="btn" href="/">Open map</Link>
        <Link className="btn btn-outline" href="/search">Search catalogue</Link>
        <Link className="btn btn-outline" href="/help">Help</Link>
      </div>
    </div>
  );
}
