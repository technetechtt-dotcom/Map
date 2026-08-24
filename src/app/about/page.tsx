import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_PILOT_LINE } from "@/lib/brand";
import { SEED_CATALOGUE } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `About · ${PRODUCT_NAME}`,
  description: PRODUCT_DESCRIPTION,
};

export default async function AboutPage() {
  const [ncTowns, organisations, nationalPins, verified] = await Promise.all([
    prisma.location.count({
      where: { province: { slug: "northern-cape" }, lastVerifiedAt: { not: null } },
    }),
    prisma.organisation.count({ where: { status: "PUBLISHED" } }),
    prisma.location.count({ where: { sourceConfidence: "public-directory" } }),
    prisma.location.count({ where: { lastVerifiedAt: { not: null } } }),
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
        <span className="text-muted">Print this page for a one-page leave-behind.</span>
      </p>

      <div className="stat-grid mt-6">
        <div className="stat">
          <strong>{ncTowns || SEED_CATALOGUE.ncTowns}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Curated NC towns</span>
        </div>
        <div className="stat">
          <strong>{organisations || SEED_CATALOGUE.pdfOrganisations}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">PDF organisations</span>
        </div>
        <div className="stat">
          <strong>{nationalPins || SEED_CATALOGUE.nationalDirectoryPins}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">National directory pins</span>
        </div>
        <div className="stat">
          <strong>{verified}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Desktop-verified pins</span>
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
          Northern Cape is the deep, sourced pilot. The other eight provinces are a directory
          scaffold so tenancy, search and reporting are national on day one. Depth follows
          official ingestion — it is not a claim of national field coverage.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">What is live today</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>{SEED_CATALOGUE.ncTowns} Northern Cape towns</strong> from the mLab NC
            presentation, desktop-verified, town-centre coordinates.
          </li>
          <li>
            <strong>{SEED_CATALOGUE.pdfOrganisations} organisations</strong> and contacts from
            that same sourced set.
          </li>
          <li>
            <strong>{SEED_CATALOGUE.nationalDirectoryPins} national public-directory pins</strong>{" "}
            (universities and institutions) so the map can switch provinces.
          </li>
          <li>
            A larger candidate spreadsheet exists for research. It is <strong>not</strong> loaded
            as live map truth. Do not claim 100+ verified locations.
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
            — Kimberley and the Northern Cape towns. Set Verification to Current (desktop + field) for the desktop-reviewed set.
          </li>
          <li>
            <Link className="text-g700 font-semibold" href="/organisations">
              Contacts
            </Link>{" "}
            — sourced organisations, not a scrapelist.
          </li>
          <li>
            <Link className="text-g700 font-semibold" href="/national">
              National
            </Link>{" "}
            — nine-province scaffold and verification counts.
          </li>
          <li>
            Sign in as super or provincial admin — locations workflow, then{" "}
            <Link className="text-g700 font-semibold" href="/admin/ops">
              Operations
            </Link>
            .
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
