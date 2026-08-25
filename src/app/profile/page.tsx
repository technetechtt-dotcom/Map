import Link from "next/link";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_PILOT_LINE } from "@/lib/brand";
import { SEED_CATALOGUE } from "@/lib/catalogue";

export const metadata = {
  title: `Platform profile · ${PRODUCT_NAME}`,
  description:
    "A concise profile of the SA ICT Ecosystem Map: its purpose, capabilities, governance model and rollout path.",
};

const pillars = [
  {
    number: "01",
    title: "Discover",
    body: "Searchable map and directory for ICT companies, hubs, campuses, funders, programmes and skills partners.",
  },
  {
    number: "02",
    title: "Govern",
    body: "A draft, review, verify and publish workflow keeps public records accountable and makes provenance visible.",
  },
  {
    number: "03",
    title: "Coordinate",
    body: "Shared profiles, relationships, opportunities and geographic filters help programme teams act on the same picture.",
  },
  {
    number: "04",
    title: "Publish",
    body: "Public map views, national coverage, exports and a printable system book turn ecosystem data into a usable brief.",
  },
];

const audiences = [
  "Provincial economic development and skills desks",
  "Municipal innovation and digital-inclusion teams",
  "National coordinators and development agencies",
  "Incubators, hubs, universities and TVET partners",
  "Funders, programme operators and ecosystem researchers",
];

export default function PlatformProfilePage() {
  return (
    <div className="page max-w-6xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="eyebrow">Platform profile · {PRODUCT_PILOT_LINE}</p>
          <h1 className="mt-2">A governed map of South Africa&apos;s ICT ecosystem.</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">{PRODUCT_DESCRIPTION}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/" className="btn">
            Open the map
          </Link>
          <Link href="/proposal" className="btn btn-outline">
            Read the proposal
          </Link>
        </div>
      </div>

      <div className="stat-grid mt-8">
        <div className="stat">
          <strong>9</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Province scaffold</span>
        </div>
        <div className="stat">
          <strong>{SEED_CATALOGUE.ncTowns}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Curated NC towns</span>
        </div>
        <div className="stat">
          <strong>{SEED_CATALOGUE.pdfOrganisations}</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Sourced organisations</span>
        </div>
        <div className="stat">
          <strong>4</strong>
          <span className="text-xs uppercase tracking-wide text-muted">Publication stages</span>
        </div>
      </div>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <article className="panel-card">
          <p className="eyebrow">Executive profile</p>
          <h2 className="mt-2 text-2xl font-bold">One shared, current picture of who is where.</h2>
          <p className="mt-3 leading-relaxed text-muted">
            ICT, skills and innovation capacity is distributed across towns, campuses, hubs and
            agencies. The SA ICT Ecosystem Map gives public-sector and programme teams a common
            operating picture: discover the relevant partners, understand the evidence behind each
            record, and move verified information into a public map that people can use.
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            Northern Cape is the depth-first pilot. The remaining eight provinces are structured as
            a national directory scaffold so the platform can expand without changing its operating
            model or data contract.
          </p>
        </article>

        <aside className="panel-card bg-g950 text-white">
          <p className="eyebrow !text-emerald-100">Positioning</p>
          <h2 className="mt-2 text-2xl font-bold">A civic data product, not a scrapelist.</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-emerald-50">
            <li>• Public discovery with accountable publication.</li>
            <li>• Evidence and verification status on the record.</li>
            <li>• Role-scoped administration and audit history.</li>
            <li>• National structure with provincial depth where evidence exists.</li>
          </ul>
        </aside>
      </section>

      <section className="mt-10">
        <p className="eyebrow">What the platform does</p>
        <h2 className="mt-2 text-2xl font-bold">Four capabilities around one governed dataset.</h2>
        <div className="card-grid mt-5">
          {pillars.map((pillar) => (
            <article key={pillar.number} className="panel-card">
              <span className="text-sm font-extrabold text-g500">{pillar.number}</span>
              <h3 className="mt-2 text-xl font-bold">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <article className="panel-card">
          <p className="eyebrow">Designed for</p>
          <h2 className="mt-2 text-2xl font-bold">Teams that need a shared operating picture.</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {audiences.map((audience) => (
              <li key={audience}>{audience}</li>
            ))}
          </ul>
        </article>
        <article className="panel-card">
          <p className="eyebrow">Trust model</p>
          <h2 className="mt-2 text-2xl font-bold">Useful in public because the workflow is private and disciplined.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Contributors can propose and maintain records within their scope. Reviewers verify
            evidence. Administrators control publication. Audit events, tenant boundaries,
            encrypted secrets, backup controls and data-rights routes support responsible operation.
          </p>
          <Link href="/about" className="mt-4 inline-block text-sm font-semibold text-g700">
            See the current catalogue and evidence notes →
          </Link>
        </article>
      </section>

      <section className="mt-10 panel-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Rollout path</p>
            <h2 className="mt-2 text-2xl font-bold">Start with a trusted provincial pilot; scale the model nationally.</h2>
          </div>
          <Link href="/proposal" className="btn no-print">
            View implementation proposal
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-soft p-4">
            <strong className="block">Pilot</strong>
            <span className="mt-1 block text-sm text-muted">Confirm priority datasets, owners and verification rules in Northern Cape.</span>
          </div>
          <div className="rounded-xl bg-soft p-4">
            <strong className="block">Operationalise</strong>
            <span className="mt-1 block text-sm text-muted">Run contributor, reviewer and administrator workflows with measurable service levels.</span>
          </div>
          <div className="rounded-xl bg-soft p-4">
            <strong className="block">Scale</strong>
            <span className="mt-1 block text-sm text-muted">Onboard provinces and partners through the same data contract, APIs and governance model.</span>
          </div>
        </div>
      </section>

      <p className="mt-8 text-sm text-muted">
        Scope note: Northern Cape records are the curated pilot set. National coverage is a public-directory scaffold and should not be read as equivalent field verification.
      </p>
    </div>
  );
}
