import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="page max-w-3xl">
      <p className="eyebrow">Support</p>
      <h1>Help</h1>
      <p className="text-muted mb-6">How to use the map, submit records, request corrections, and claim an organisation.</p>
      <div className="grid gap-4">
        <section className="panel-card">
          <h2 className="font-bold">Using the map</h2>
          <p className="text-sm text-muted">On phones use Map or List. Desktop shows both. Filters stay in the URL so you can share a view.</p>
        </section>
        <section className="panel-card">
          <h2 className="font-bold">Submissions</h2>
          <p className="text-sm text-muted">Anyone can propose a listing. You receive a tracking reference such as ICT-2026-00452 to check progress on the track page.</p>
          <p className="mt-2"><Link className="text-g700 font-semibold" href="/submit">Submit a listing →</Link></p>
        </section>
        <section className="panel-card">
          <h2 className="font-bold">Verification and claims</h2>
          <p className="text-sm text-muted">Organisation profiles can be claimed. Approved claimants become organisation administrators after review.</p>
        </section>
        <section className="panel-card">
          <h2 className="font-bold">Corrections and data rights</h2>
          <p className="text-sm text-muted">Request a correction from a record page, or use POPIA data-subject rights.</p>
          <p className="mt-2"><Link className="text-g700 font-semibold" href="/rights">Data rights →</Link> · <Link className="text-g700 font-semibold" href="/faq">FAQ →</Link> · <Link className="text-g700 font-semibold" href="/contact">Contact →</Link></p>
        </section>
      </div>
    </div>
  );
}
