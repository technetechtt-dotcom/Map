import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="page max-w-2xl">
      <p className="eyebrow">Legal</p>
      <h1>Privacy notice</h1>
      <p className="text-muted mt-2">
        This platform processes limited personal information for ICT ecosystem directory and
        administration purposes under South African POPIA.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          Published listings may show contact details supplied for public discovery.
        </li>
        <li>
          Community submissions require your name and email so we can contact you about the
          listing.
        </li>
        <li>
          Administrators access only the data authorised for their province or organisation.
        </li>
        <li>
          Cookies: authentication session cookies by default (no advertising cookies).
        </li>
      </ul>
      <p className="mt-4 text-sm">
        To exercise access, correction or deletion rights, contact the platform operator or use
        the data-subject request process described in internal governance documentation.
      </p>
      <h2 className="mt-6 font-bold">Purpose, retention and sharing</h2>
      <p className="mt-2 text-sm">We process account data for access control and audit, submission contact data for review, and public organisation contacts for ecosystem discovery. Analytics are retained for 90 days by default; audit records are append-only and archived under the retention schedule; encrypted backups follow the configured backup lifecycle.</p>
      <p className="mt-2 text-sm">Information is shared only with authorised national, provincial or organisation administrators, contracted operators, and lawful authorities where required. Cross-border hosting or operators require an approved data-processing agreement and POPIA safeguards.</p>
      <h2 className="mt-6 font-bold">Information Officer and complaints</h2>
      <p className="mt-2 text-sm">The deploying authority must publish its Information Officer contact details before launch. You may use the <Link href="/rights" className="text-g700 font-semibold">rights request form</Link> or complain to South Africa&apos;s Information Regulator.</p>
      <p className="mt-6">
        <Link href="/" className="text-g700 font-semibold">
          Back to map
        </Link>
      </p>
    </div>
  );
}
