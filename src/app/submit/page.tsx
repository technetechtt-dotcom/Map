"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AddressPicker from "@/components/AddressPicker";
import Link from "next/link";

const TYPES = [
  { id: "location", label: "Location / site" },
  { id: "organisation", label: "Organisation" },
  { id: "funding", label: "Funding opportunity" },
  { id: "events", label: "Event" },
  { id: "programmes", label: "Programme" },
  { id: "procurement", label: "Procurement / tender" },
] as const;

const PROVINCES = [
  ["northern-cape", "Northern Cape"],
  ["gauteng", "Gauteng"],
  ["western-cape", "Western Cape"],
  ["eastern-cape", "Eastern Cape"],
  ["kwazulu-natal", "KwaZulu-Natal"],
  ["free-state", "Free State"],
  ["limpopo", "Limpopo"],
  ["mpumalanga", "Mpumalanga"],
  ["north-west", "North West"],
];

const CATEGORIES = [
  ["knowledge-hub", "Knowledge hub"],
  ["university", "University"],
  ["tvet", "TVET college"],
  ["innovation-hub", "Innovation hub"],
  ["digital-infrastructure", "Digital infrastructure"],
];

function csv(value: FormDataEntryValue | null) {
  return String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function SubmitForm() {
  const params = useSearchParams();
  const initialType = TYPES.some((t) => t.id === params.get("type")) ? (params.get("type") as (typeof TYPES)[number]["id"]) : "location";
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>(initialType);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const typeLabel = useMemo(() => TYPES.find((t) => t.id === type)?.label || "listing", [type]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("name") || "");
    const payload: Record<string, unknown> = {
      name: title,
      title,
      summary: String(fd.get("summary") || ""),
      provinceSlug: String(fd.get("provinceSlug") || "northern-cape"),
      url: String(fd.get("url") || "") || undefined,
    };
    if (type === "location") {
      const latitude = String(fd.get("latitude") || "").trim();
      const longitude = String(fd.get("longitude") || "").trim();
      payload.latitude = latitude ? Number(latitude) : undefined;
      payload.longitude = longitude ? Number(longitude) : undefined;
      payload.address = String(fd.get("address") || "");
      payload.categorySlug = String(fd.get("categorySlug") || "knowledge-hub");
      payload.opportunities = csv(fd.get("opportunities"));
      payload.assets = csv(fd.get("assets"));
    }
    if (type === "organisation") {
      payload.organisationType = String(fd.get("organisationType") || "");
      payload.website = String(fd.get("url") || "") || undefined;
      payload.email = String(fd.get("orgEmail") || "") || undefined;
      payload.phone = String(fd.get("orgPhone") || "") || undefined;
      payload.address = String(fd.get("address") || "") || undefined;
      const latitude = String(fd.get("latitude") || "").trim();
      const longitude = String(fd.get("longitude") || "").trim();
      payload.latitude = latitude ? Number(latitude) : undefined;
      payload.longitude = longitude ? Number(longitude) : undefined;
      payload.services = csv(fd.get("services"));
      payload.skills = csv(fd.get("skills"));
      payload.technologies = csv(fd.get("technologies"));
      payload.logoUrl = String(fd.get("logoUrl") || "") || undefined;
      payload.locationSlugs = csv(fd.get("locationSlugs"));
      payload.evidence = csv(fd.get("evidence"));
    }
    if (type === "funding") {
      payload.amount = String(fd.get("amount") || "") || undefined;
      payload.minAmount = String(fd.get("minAmount") || "") || undefined;
      payload.maxAmount = String(fd.get("maxAmount") || "") || undefined;
      payload.deadline = String(fd.get("deadline") || "") || undefined;
      payload.eligibility = String(fd.get("eligibility") || "") || undefined;
      payload.funder = String(fd.get("funder") || "") || undefined;
      payload.sectors = csv(fd.get("sectors"));
      payload.targetProvinces = csv(fd.get("targetProvinces"));
      payload.applicationUrl = String(fd.get("applicationUrl") || "") || undefined;
      payload.applicationProcess = String(fd.get("applicationProcess") || "") || undefined;
    }
    if (type === "events") {
      payload.startsAt = String(fd.get("startsAt") || "") || undefined;
      payload.endsAt = String(fd.get("endsAt") || "") || undefined;
      payload.venue = String(fd.get("venue") || "") || undefined;
      payload.organiser = String(fd.get("organiser") || "") || undefined;
      payload.onlineUrl = String(fd.get("onlineUrl") || "") || undefined;
      payload.registrationUrl = String(fd.get("registrationUrl") || "") || undefined;
      payload.cost = String(fd.get("cost") || "") || undefined;
      payload.capacity = String(fd.get("capacity") || "") || undefined;
      payload.attendanceFormat = String(fd.get("attendanceFormat") || "") || undefined;
    }
    if (type === "programmes") {
      payload.startDate = String(fd.get("startDate") || "") || undefined;
      payload.endDate = String(fd.get("endDate") || "") || undefined;
      payload.provider = String(fd.get("provider") || "") || undefined;
      payload.eligibility = String(fd.get("eligibility") || "") || undefined;
      payload.capacity = String(fd.get("capacity") || "") || undefined;
      payload.deliveryMethod = String(fd.get("deliveryMethod") || "") || undefined;
      payload.applicationUrl = String(fd.get("applicationUrl") || "") || undefined;
    }
    if (type === "procurement") {
      payload.closingDate = String(fd.get("closingDate") || "") || undefined;
      payload.closingTime = String(fd.get("closingTime") || "") || undefined;
      payload.budget = String(fd.get("budget") || "") || undefined;
      payload.referenceNumber = String(fd.get("referenceNumber") || "") || undefined;
      payload.issuingAuthority = String(fd.get("issuingAuthority") || "") || undefined;
      payload.documents = csv(fd.get("documents"));
      payload.briefingAt = String(fd.get("briefingAt") || "") || undefined;
      payload.eligibility = String(fd.get("eligibility") || "") || undefined;
      payload.procurementCategory = String(fd.get("procurementCategory") || "") || undefined;
    }

    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        submitterName: fd.get("submitterName"),
        submitterEmail: fd.get("submitterEmail"),
        notes: fd.get("notes"),
        website: fd.get("website") || "",
        consent: fd.get("consent") === "on",
        payload,
      }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus(`Thank you — track progress with ${data.trackingRef || "your email"}.`);
      setFormVersion((value) => value + 1);
    } else {
      setStatus(data.error || "Submission failed");
    }
  }

  return (
    <div className="page max-w-2xl">
      <p className="eyebrow">Community</p>
      <h1>Submit a listing</h1>
      <p className="text-muted mb-6">
        Propose a {typeLabel.toLowerCase()}. Use dropdowns and address search instead of technical slugs. You will receive a tracking reference such as ICT-2026-00452.
      </p>
      <form key={formVersion} onSubmit={onSubmit} className="panel-card grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">Listing type
          <select className="field" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number]["id"])}>
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Your name<input className="field" name="submitterName" required /></label>
        <label className="grid gap-1 text-sm font-semibold">Your email<input className="field" name="submitterEmail" type="email" required /></label>
        <label className="grid gap-1 text-sm font-semibold">Name / title<input className="field" name="name" required /></label>
        <label className="grid gap-1 text-sm font-semibold">Summary<textarea className="field min-h-[100px]" name="summary" required /></label>
        <label className="grid gap-1 text-sm font-semibold">Province
          <select className="field" name="provinceSlug" defaultValue="northern-cape">
            {PROVINCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {type === "location" && (
          <>
            <AddressPicker />
            <label className="grid gap-1 text-sm font-semibold">Category
              <select className="field" name="categorySlug" defaultValue="knowledge-hub">
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">Opportunities<input className="field" name="opportunities" /></label>
            <label className="grid gap-1 text-sm font-semibold">Assets<input className="field" name="assets" /></label>
          </>
        )}
        {type === "organisation" && (
          <>
            <label className="grid gap-1 text-sm font-semibold">Organisation type<input className="field" name="organisationType" placeholder="Digital hub, TVET, university…" /></label>
            <label className="grid gap-1 text-sm font-semibold">Email<input className="field" name="orgEmail" type="email" /></label>
            <label className="grid gap-1 text-sm font-semibold">Phone<input className="field" name="orgPhone" /></label>
            <AddressPicker />
            <label className="grid gap-1 text-sm font-semibold">Services<input className="field" name="services" /></label>
            <label className="grid gap-1 text-sm font-semibold">Skills<input className="field" name="skills" /></label>
            <label className="grid gap-1 text-sm font-semibold">Technologies<input className="field" name="technologies" /></label>
            <label className="grid gap-1 text-sm font-semibold">Logo URL<input className="field" name="logoUrl" /></label>
            <label className="grid gap-1 text-sm font-semibold">Linked location slugs<input className="field" name="locationSlugs" /></label>
            <label className="grid gap-1 text-sm font-semibold">Evidence URLs<input className="field" name="evidence" /></label>
          </>
        )}
        {type === "funding" && (
          <>
            <label className="grid gap-1 text-sm font-semibold">Amount<input className="field" name="amount" /></label>
            <label className="grid gap-1 text-sm font-semibold">Min amount<input className="field" name="minAmount" /></label>
            <label className="grid gap-1 text-sm font-semibold">Max amount<input className="field" name="maxAmount" /></label>
            <label className="grid gap-1 text-sm font-semibold">Deadline<input className="field" name="deadline" type="date" /></label>
            <label className="grid gap-1 text-sm font-semibold">Eligibility<textarea className="field" name="eligibility" /></label>
            <label className="grid gap-1 text-sm font-semibold">Funder<input className="field" name="funder" /></label>
            <label className="grid gap-1 text-sm font-semibold">Sectors<input className="field" name="sectors" /></label>
            <label className="grid gap-1 text-sm font-semibold">Target provinces<input className="field" name="targetProvinces" /></label>
            <label className="grid gap-1 text-sm font-semibold">Application link<input className="field" name="applicationUrl" /></label>
            <label className="grid gap-1 text-sm font-semibold">Application process<textarea className="field" name="applicationProcess" /></label>
          </>
        )}
        {type === "events" && (
          <>
            <label className="grid gap-1 text-sm font-semibold">Starts<input className="field" name="startsAt" type="datetime-local" /></label>
            <label className="grid gap-1 text-sm font-semibold">Ends<input className="field" name="endsAt" type="datetime-local" /></label>
            <label className="grid gap-1 text-sm font-semibold">Organiser<input className="field" name="organiser" /></label>
            <label className="grid gap-1 text-sm font-semibold">Venue<input className="field" name="venue" /></label>
            <label className="grid gap-1 text-sm font-semibold">Registration URL<input className="field" name="registrationUrl" /></label>
            <label className="grid gap-1 text-sm font-semibold">Online URL<input className="field" name="onlineUrl" /></label>
            <label className="grid gap-1 text-sm font-semibold">Cost<input className="field" name="cost" placeholder="Free or fee" /></label>
            <label className="grid gap-1 text-sm font-semibold">Capacity<input className="field" name="capacity" /></label>
            <label className="grid gap-1 text-sm font-semibold">Attendance format
              <select className="field" name="attendanceFormat">
                <option value="in-person">In person</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
          </>
        )}
        {type === "programmes" && (
          <>
            <label className="grid gap-1 text-sm font-semibold">Start date<input className="field" name="startDate" type="date" /></label>
            <label className="grid gap-1 text-sm font-semibold">End date<input className="field" name="endDate" type="date" /></label>
            <label className="grid gap-1 text-sm font-semibold">Provider<input className="field" name="provider" /></label>
            <label className="grid gap-1 text-sm font-semibold">Eligibility<textarea className="field" name="eligibility" /></label>
            <label className="grid gap-1 text-sm font-semibold">Capacity<input className="field" name="capacity" /></label>
            <label className="grid gap-1 text-sm font-semibold">Delivery mode<input className="field" name="deliveryMethod" /></label>
            <label className="grid gap-1 text-sm font-semibold">Application link<input className="field" name="applicationUrl" /></label>
          </>
        )}
        {type === "procurement" && (
          <>
            <label className="grid gap-1 text-sm font-semibold">Closing date<input className="field" name="closingDate" type="date" /></label>
            <label className="grid gap-1 text-sm font-semibold">Closing time<input className="field" name="closingTime" type="time" /></label>
            <label className="grid gap-1 text-sm font-semibold">Budget / value<input className="field" name="budget" /></label>
            <label className="grid gap-1 text-sm font-semibold">Reference number<input className="field" name="referenceNumber" /></label>
            <label className="grid gap-1 text-sm font-semibold">Issuing authority<input className="field" name="issuingAuthority" /></label>
            <label className="grid gap-1 text-sm font-semibold">Documents<input className="field" name="documents" /></label>
            <label className="grid gap-1 text-sm font-semibold">Briefing<input className="field" name="briefingAt" type="datetime-local" /></label>
            <label className="grid gap-1 text-sm font-semibold">Eligibility<textarea className="field" name="eligibility" /></label>
            <label className="grid gap-1 text-sm font-semibold">Category<input className="field" name="procurementCategory" /></label>
          </>
        )}
        <label className="grid gap-1 text-sm font-semibold">Website / source URL<input className="field" name="url" /></label>
        <label className="grid gap-1 text-sm font-semibold">Notes for reviewers<textarea className="field" name="notes" /></label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-1" />
          <span>I consent to processing my name and email to review this submission, as described in the <a className="text-g700 font-semibold" href="/privacy">privacy notice</a>.</span>
        </label>
        <label className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          Website<input className="field" name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <button className="btn" type="submit" disabled={loading}>{loading ? "Submitting…" : "Submit for review"}</button>
        {status && <p className="text-sm font-semibold text-g700">{status} <Link href="/track">Track status</Link></p>}
      </form>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <Suspense fallback={<div className="page">Loading…</div>}>
      <SubmitForm />
    </Suspense>
  );
}
