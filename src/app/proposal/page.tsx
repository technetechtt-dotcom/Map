import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_PILOT_LINE } from "@/lib/brand";

export const metadata = {
  title: `Implementation proposal · ${PRODUCT_NAME}`,
  description:
    "Discussion proposal for commissioning the Northern Cape pilot and scaling the SA ICT Ecosystem Map nationally.",
};

const workstreams = [
  ["01", "Discovery and alignment", "Confirm decision owners, priority users, source systems, terminology, geography and publication policy."],
  ["02", "Data and verification", "Ingest priority datasets, reconcile duplicates, capture provenance and run a repeatable review and verification campaign."],
  ["03", "Platform operations", "Configure roles, workflows, notifications, audit, backups and service ownership for a dependable operating rhythm."],
  ["04", "Adoption and insight", "Train users, publish the first public brief, measure usage and turn map data into opportunity and coverage insight."],
];

const deliverables = [
  "Validated Northern Cape ecosystem baseline with source and verification status",
  "Public map, organisation directory and printable system book configured for the agreed scope",
  "Contributor, reviewer and administrator operating playbook",
  "Data-quality register covering gaps, duplicates, stale records and follow-up actions",
  "Launch dashboard with agreed adoption, data-quality and service measures",
  "Scale-ready national onboarding plan for the remaining provinces",
];

const measures = [
  ["Coverage", "Priority towns, organisations and opportunity categories represented against the agreed baseline."],
  ["Quality", "Published records have provenance, an accountable owner and a review or verification status."],
  ["Adoption", "Target teams use the map and directory in planning, referrals, sourcing and reporting."],
  ["Sustainability", "Named owners, review cadence, backup controls and an expansion backlog are in place."],
];

export default function ProposalPage() {
  return (
    <div className="page max-w-6xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="eyebrow">Discussion proposal · {PRODUCT_PILOT_LINE}</p>
          <h1 className="mt-2">From a Northern Cape pilot to a national ICT ecosystem service.</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
            A practical commission to establish a trusted provincial baseline, put the governance
            workflow into daily use, and leave a repeatable path for national scale.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/profile" className="btn btn-outline">
            Platform profile
          </Link>
          <Link href="/" className="btn">
            Open the live map
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <article className="panel-card">
          <p className="eyebrow">The opportunity</p>
          <h2 className="mt-2 text-2xl font-bold">Replace fragmented lists with an operating picture teams can trust.</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Provincial and national programmes often have the same problem: important ecosystem
            knowledge exists, but it is distributed across spreadsheets, presentations, websites
            and personal networks. This proposal turns that knowledge into a maintained public
            service with a clear evidence trail and accountable publication decisions.
          </p>
        </article>
        <aside className="panel-card bg-g950 text-white">
          <p className="eyebrow !text-emerald-100">Commission outcome</p>
          <p className="mt-2 text-xl font-bold leading-snug">A live, governed Northern Cape baseline ready to inform planning, referrals and investment conversations.</p>
          <p className="mt-4 text-sm leading-relaxed text-emerald-50">Commercial terms, dates and named stakeholders are intentionally left open for the discovery session.</p>
        </aside>
      </section>

      <section className="mt-10">
        <p className="eyebrow">Proposed scope</p>
        <h2 className="mt-2 text-2xl font-bold">Four workstreams, one accountable delivery rhythm.</h2>
        <div className="card-grid mt-5">
          {workstreams.map(([number, title, body]) => (
            <article key={number} className="panel-card">
              <span className="text-sm font-extrabold text-g500">{number}</span>
              <h3 className="mt-2 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <article className="panel-card">
          <p className="eyebrow">Primary deliverables</p>
          <h2 className="mt-2 text-2xl font-bold">What the commissioning team receives.</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {deliverables.map((deliverable) => (
              <li key={deliverable}>{deliverable}</li>
            ))}
          </ul>
        </article>
        <article className="panel-card">
          <p className="eyebrow">Working principles</p>
          <h2 className="mt-2 text-2xl font-bold">Useful, evidence-led and safe to operate.</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>Publish only what has a clear owner, source and status.</li>
            <li>Separate public discovery from private operational notes.</li>
            <li>Design for low-bandwidth, multilingual and non-map access.</li>
            <li>Make gaps visible so the next field visit is targeted.</li>
            <li>Leave the client with documentation, skills and a scale plan.</li>
          </ul>
        </article>
      </section>

      <section className="mt-10 panel-card">
        <p className="eyebrow">Indicative delivery sequence</p>
        <h2 className="mt-2 text-2xl font-bold">A focused 90-day pilot, shaped with the commissioning team.</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-line p-4">
            <strong className="block text-g700">Days 1–20 · Align</strong>
            <p className="mt-2 text-sm leading-relaxed text-muted">Kick-off, user journeys, source inventory, data contract, governance decisions and success baseline.</p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <strong className="block text-g700">Days 21–60 · Build and verify</strong>
            <p className="mt-2 text-sm leading-relaxed text-muted">Ingest and reconcile priority records, configure workflows, complete verification and prepare launch content.</p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <strong className="block text-g700">Days 61–90 · Launch and transfer</strong>
            <p className="mt-2 text-sm leading-relaxed text-muted">Publish the baseline, train users, review measures, document operations and agree the national scale backlog.</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <p className="eyebrow">Success measures</p>
        <h2 className="mt-2 text-2xl font-bold">Evidence of value after the pilot.</h2>
        <div className="mt-5 overflow-x-auto rounded-[var(--radius)] border border-line bg-white">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3">Dimension</th>
                <th className="px-5 py-3">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {measures.map(([dimension, evidence]) => (
                <tr key={dimension} className="border-t border-line">
                  <th className="px-5 py-4 font-bold text-g700">{dimension}</th>
                  <td className="px-5 py-4 leading-relaxed text-muted">{evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <article className="panel-card">
          <p className="eyebrow">Decisions needed to start</p>
          <h2 className="mt-2 text-2xl font-bold">Four inputs unlock the first sprint.</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>Name the accountable sponsor and day-to-day product owner.</li>
            <li>Confirm the first priority users, municipalities and ecosystem categories.</li>
            <li>Approve the source and verification policy for public records.</li>
            <li>Agree the pilot review cadence and acceptance measures.</li>
          </ol>
        </article>
        <article className="panel-card">
          <p className="eyebrow">Commercial note</p>
          <h2 className="mt-2 text-2xl font-bold">Scope first; price follows the agreed baseline.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            This is a discussion proposal, not a binding quotation. The delivery fee, hosting model,
            support level, data-ingestion effort and any national expansion phase should be priced
            after the discovery session confirms the baseline and responsibilities.
          </p>
        </article>
      </section>

      <section className="mt-10 panel-card bg-soft">
        <p className="eyebrow">Recommended next step</p>
        <h2 className="mt-2 text-2xl font-bold">Book a 60-minute discovery session.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          Use the session to select the pilot user group, confirm the first source inventory and
          leave with a named owner for each decision. The output is a short statement of work and a
          delivery calendar that the platform team can execute immediately.
        </p>
        <div className="no-print mt-5 flex flex-wrap gap-2">
          <Link href="/profile" className="btn">
            Review platform profile
          </Link>
          <Link href="/submit" className="btn btn-outline">
            Contact the platform team
          </Link>
        </div>
      </section>
    </div>
  );
}
