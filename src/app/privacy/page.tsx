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
      <p className="mt-6">
        <Link href="/" className="text-g700 font-semibold">
          Back to map
        </Link>
      </p>
    </div>
  );
}
