import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="page max-w-2xl">
      <p className="eyebrow">Legal</p>
      <h1>Terms of use</h1>
      <p className="mt-3">The SA ICT Ecosystem Map is a public-interest directory. Listings are informational and do not constitute endorsement, procurement advice or a guarantee of eligibility.</p>
      <h2 className="mt-6 font-bold">Acceptable use</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
        <li>Do not scrape, disrupt, probe or misuse personal contact information.</li>
        <li>API consumers must respect quotas, attribution and applicable data licences.</li>
        <li>Submitters must provide accurate information they are authorised to share.</li>
      </ul>
      <h2 className="mt-6 font-bold">Corrections and availability</h2>
      <p className="mt-2 text-sm">Information may be corrected, archived or removed after review. Service and data may change without notice. Use the rights workflow to report inaccurate or unlawful content.</p>
      <p className="mt-6"><Link href="/rights" className="text-g700 font-semibold">Data rights and corrections</Link></p>
    </div>
  );
}
