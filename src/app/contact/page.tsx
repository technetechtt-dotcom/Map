import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="page max-w-2xl">
      <p className="eyebrow">Support</p>
      <h1>Contact / Support</h1>
      <p className="text-muted mb-4">Use this page for map usage questions, submission help, claims, and correction follow-up. Data-subject requests stay on the rights page.</p>
      <div className="panel-card grid gap-3">
        <p><strong>Catalogue and map:</strong> use Help and FAQ first.</p>
        <p><strong>Submission progress:</strong> <Link className="text-g700 font-semibold" href="/track">track a reference</Link>.</p>
        <p><strong>Corrections:</strong> open the record and request a correction, or email the support inbox listed in the privacy notice.</p>
        <p><strong>POPIA:</strong> <Link className="text-g700 font-semibold" href="/rights">data-subject request form</Link>.</p>
      </div>
    </div>
  );
}
