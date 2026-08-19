import { parseJsonArray } from "./shape";

export type MatchableOrg = {
  id: string;
  name: string;
  type?: string | null;
  provinceId?: string | null;
  servicesJson?: unknown;
  skillsJson?: unknown;
  industrySectorsJson?: unknown;
  beeLevel?: string | null;
  companySize?: string | null;
};

export type MatchableFunding = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  provinceId?: string | null;
  deadline?: Date | null;
  fundingType?: string | null;
  businessStage?: string | null;
  geography?: string | null;
  ownershipCriteria?: string | null;
  eligibleSectorsJson?: unknown;
  tagsJson?: unknown;
};

export type MatchableTender = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  provinceId?: string | null;
  procurementCategory?: string | null;
  closingDate?: Date | null;
  tagsJson?: unknown;
};

function tokens(value: unknown): string[] {
  return parseJsonArray(value).map((item) => String(item).toLowerCase());
}

function textHaystack(org: MatchableOrg): string {
  return [org.name, org.type, ...tokens(org.servicesJson), ...tokens(org.skillsJson), ...tokens(org.industrySectorsJson)]
    .join(" ")
    .toLowerCase();
}

export function scoreFundingMatch(org: MatchableOrg, call: MatchableFunding) {
  const reasons: string[] = [];
  const missing: string[] = [];
  let score = 0;
  const haystack = textHaystack(org);
  const sectors = tokens(call.eligibleSectorsJson);
  const tags = tokens(call.tagsJson);
  if (call.provinceId && org.provinceId && call.provinceId === org.provinceId) {
    score += 25;
    reasons.push("Same province");
  } else if (call.provinceId && org.provinceId && call.provinceId !== org.provinceId) {
    missing.push("Geography / province eligibility");
  } else {
    score += 8;
  }
  const sectorHits = sectors.filter((sector) => haystack.includes(sector) || tokens(org.industrySectorsJson).includes(sector));
  if (sectorHits.length) {
    score += Math.min(30, sectorHits.length * 10);
    reasons.push(`Sectors: ${sectorHits.join(", ")}`);
  } else if (sectors.length) {
    missing.push(`Eligible sectors: ${sectors.join(", ")}`);
  }
  const tagHits = tags.filter((tag) => haystack.includes(tag));
  if (tagHits.length) {
    score += Math.min(20, tagHits.length * 5);
    reasons.push(`Keywords: ${tagHits.join(", ")}`);
  }
  if (call.ownershipCriteria && org.beeLevel && call.ownershipCriteria.toLowerCase().includes("b-bbee")) {
    score += 10;
    reasons.push("B-BBEE ownership data present");
  } else if (call.ownershipCriteria) {
    missing.push("Ownership / B-BBEE evidence");
  }
  if (call.businessStage && (org.companySize || "").toLowerCase().includes(String(call.businessStage).toLowerCase())) {
    score += 10;
    reasons.push("Business stage matches");
  }
  return { score: Math.min(100, score), reasons, missing, qualifies: score >= 40 && missing.length === 0 };
}

export function scoreTenderMatch(org: MatchableOrg, tender: MatchableTender) {
  const haystack = textHaystack(org);
  const tags = tokens(tender.tagsJson);
  const category = (tender.procurementCategory || "").toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  if (tender.provinceId && org.provinceId === tender.provinceId) {
    score += 20;
    reasons.push("Same province");
  }
  if (category && haystack.includes(category)) {
    score += 30;
    reasons.push(`Category ${tender.procurementCategory}`);
  }
  const hits = tags.filter((tag) => haystack.includes(tag));
  if (hits.length) {
    score += Math.min(30, hits.length * 8);
    reasons.push(`Services: ${hits.join(", ")}`);
  }
  return { score: Math.min(100, score), reasons, qualifies: score >= 35 };
}

export function scoreProgrammeMatch(org: MatchableOrg, programme: { title: string; summary: string; tagsJson?: unknown; provinceId?: string | null }) {
  const haystack = textHaystack(org);
  const tags = tokens(programme.tagsJson);
  let score = tags.filter((tag) => haystack.includes(tag)).length * 12;
  if (programme.provinceId && org.provinceId === programme.provinceId) score += 20;
  if (haystack.includes("training") || haystack.includes("incub")) score += 15;
  return { score: Math.min(100, score), reasons: tags.slice(0, 5) };
}
