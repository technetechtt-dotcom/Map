import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_PILOT_LINE } from "@/lib/brand";
import { getOpsAppUrl } from "@/lib/platform";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `About · ${PRODUCT_NAME}`,
  description: PRODUCT_DESCRIPTION,
};

export default async function AboutPage() {
  const [ncTowns, organisations, nationalPins, verified, published] = await Promise.all([
    prisma.location.count({
      where: {
        province: { slug: "northern-cape" },
        status: { in: ["PUBLISHED", "VERIFIED"] },
      },
    }),
    prisma.organisation.count({ where: { status: "PUBLISHED" } }),
    prisma.location.count({
      where: {
        status: { in: ["PUBLISHED", "VERIFIED"] },
        NOT: { province: { slug: "northern-cape" } },
      },
    }),
    prisma.location.count({ where: { lastVerifiedAt: { not: null } } }),
    prisma.location.count({ where: { status: { in: ["PUBLISHED", "VERIFIED"] } } }),
  ]);

  return (
    <div className="page about-page max-w-3xl">
      <p className="eyebrow">{PRODUCT_PILOT_LINE}</p>
      <h1>{PRODUCT_NAME}</h1>
      <p className="text-muted mt-2 max-w-2xl">{PRODUCT_DESCRIPTION}</p>
      <p className="no-print mt-3 text-sm">
        <Link href="/" className="text-g700 font-semibold">
          Open the map
        </Link>
        {" · "}
        <Link href="/national" className="text-g700 font-semibold">
          National coverage
        </Link>
        {" · "}
        <Link href="/login" className="text-g700 font-semibold">
          Sign in
        </Link>
        {" · "}
        <Link href="/signup" className="text-g700 font-semibold">
          Sign up
        </Link>
      </p>

      <div className="stat-grid mt-6">
        <div className="stat">
          <strong>{ncTowns}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Published NC sites</span>
        </div>
        <div className="stat">
          <strong>{organisations}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Published organisations</span>
        </div>
        <div className="stat">
          <strong>{nationalPins}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Other-province sites</span>
        </div>
        <div className="stat">
          <strong>{verified}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Verified pins</span>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-bold">The problem</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Innovation, skills and funding partners in South Africa are spread across towns,
          campuses and agencies. Provincial desks and programme leads cannot see a single
          governed map of who is where, what is current, and what still needs a site visit.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">What this platform is</h2>
        <p className="mt-2 text-sm leading-relaxed">
          A public map and directory with a management workflow: draft, review, verify, publish.
          Public map and Ops console share one database — sites created and published in Ops appear
          on the map immediately.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">What is live today</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>{published} published or verified sites</strong> loaded from the shared catalogue
            (managed in Ops).
          </li>
          <li>
            <strong>{ncTowns} Northern Cape</strong> and <strong>{nationalPins} elsewhere</strong> —
            live counts, not marketing estimates.
          </li>
          <li>
            <strong>{organisations} organisations</strong> with published directory records.
          </li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">Who it is for</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Provincial economic development and skills desks, programme operators, and national
          coordinators who need a shared, auditable picture — not a scraped list.
        </p>
      </section>

      <section className="mt-6 no-print">
        <h2 className="font-bold">See it in ten minutes</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <Link className="text-g700 font-semibold" href="/">
              Map
            </Link>{" "}
            — explore published pins from the shared database.
          </li>
          <li>
            <Link className="text-g700 font-semibold" href="/organisations">
              Contacts
            </Link>{" "}
            — published organisations.
          </li>
          <li>
            <Link className="text-g700 font-semibold" href="/signup">
              Sign up
            </Link>{" "}
            or{" "}
            <Link className="text-g700 font-semibold" href="/login">
              sign in
            </Link>{" "}
            on the public map, then sign in separately to the{" "}
            <a className="text-g700 font-semibold" href={getOpsAppUrl()} rel="noopener noreferrer">
              Operations console
            </a>{" "}
            to create and publish sites.
          </li>
        </ol>
        <p className="mt-3 text-sm">
          <Link href="/privacy" className="text-g700 font-semibold">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="text-g700 font-semibold">
            Terms
          </Link>
          {" · "}
          <Link href="/rights" className="text-g700 font-semibold">
            Data rights
          </Link>
        </p>
      </section>
    </div>
  );
}
