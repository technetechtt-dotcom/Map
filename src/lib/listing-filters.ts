export type FilterField = {
  name: string;
  label: string;
  type?: "text" | "date" | "select";
  options?: { value: string; label: string }[];
};

const PROVINCES = [
  "eastern-cape",
  "free-state",
  "gauteng",
  "kwazulu-natal",
  "limpopo",
  "mpumalanga",
  "northern-cape",
  "north-west",
  "western-cape",
].map((value) => ({ value, label: value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

export const FUNDING_FILTERS: FilterField[] = [
  { name: "province", label: "Province", type: "select", options: PROVINCES },
  { name: "amount", label: "Amount" },
  { name: "sector", label: "Sector" },
  { name: "audience", label: "Target audience" },
  { name: "funder", label: "Funder" },
  { name: "fundingType", label: "Funding type" },
  { name: "tag", label: "Tags" },
  { name: "businessStage", label: "Business stage" },
  { name: "deadlineFrom", label: "Deadline from", type: "date" },
  { name: "deadlineTo", label: "Deadline to", type: "date" },
];

export const PROCUREMENT_FILTERS: FilterField[] = [
  { name: "province", label: "Province", type: "select", options: PROVINCES },
  { name: "issuingAuthority", label: "Issuing authority" },
  { name: "value", label: "Tender value" },
  { name: "category", label: "Category" },
  { name: "reference", label: "Reference number" },
  { name: "closingFrom", label: "Closing from", type: "date" },
  { name: "closingTo", label: "Closing to", type: "date" },
  { name: "smme", label: "SMME eligibility" },
];

export const PROGRAMME_FILTERS: FilterField[] = [
  { name: "province", label: "Province", type: "select", options: PROVINCES },
  { name: "audience", label: "Audience" },
  { name: "ageGroup", label: "Age group" },
  { name: "skills", label: "Skills category" },
  { name: "delivery", label: "Delivery method" },
  { name: "provider", label: "Provider" },
  { name: "applicationStatus", label: "Application status" },
  { name: "dateFrom", label: "From", type: "date" },
  { name: "dateTo", label: "To", type: "date" },
];

export const EVENT_FILTERS: FilterField[] = [
  { name: "province", label: "Province", type: "select", options: PROVINCES },
  { name: "town", label: "Town" },
  { name: "dateFrom", label: "From", type: "date" },
  { name: "dateTo", label: "To", type: "date" },
  { name: "category", label: "Category" },
  { name: "host", label: "Host organisation" },
  { name: "format", label: "Online / in-person", type: "select", options: [
    { value: "online", label: "Online" },
    { value: "in-person", label: "In person" },
  ] },
  { name: "cost", label: "Free / paid", type: "select", options: [
    { value: "free", label: "Free" },
    { value: "paid", label: "Paid" },
  ] },
];

function textOf(item: Record<string, unknown>, keys: string[]) {
  return keys
    .flatMap((key) => {
      const value = item[key];
      if (Array.isArray(value)) return value.map(String);
      if (value && typeof value === "object") {
        const nested = value as { name?: string; slug?: string };
        return [nested.name, nested.slug];
      }
      return [value == null ? "" : String(value)];
    })
    .join(" ")
    .toLowerCase();
}

function inRange(value: Date | string | null | undefined, from?: string, to?: string) {
  if (!value) return !from && !to;
  const ms = new Date(value).getTime();
  if (from && ms < new Date(from).getTime()) return false;
  if (to && ms > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export function applyListingFilters<T extends Record<string, unknown>>(
  type: "funding" | "procurement" | "programmes" | "events",
  items: T[],
  filters: Record<string, string | undefined>
) {
  return items.filter((item) => {
    if (filters.province) {
      const province = textOf(item, ["province", "geography"]);
      if (!province.includes(filters.province.toLowerCase().replace(/-/g, " ")) && !province.includes(filters.province.toLowerCase())) {
        return false;
      }
    }
    if (type === "funding") {
      if (filters.amount && !textOf(item, ["amount", "minAmount", "maxAmount"]).includes(filters.amount.toLowerCase())) return false;
      if (filters.sector && !textOf(item, ["eligibleSectorsJson", "tags"]).includes(filters.sector.toLowerCase())) return false;
      if (filters.audience && !textOf(item, ["targetAudience", "ownershipCriteria", "tags"]).includes(filters.audience.toLowerCase())) return false;
      if (filters.funder && !textOf(item, ["organisation"]).includes(filters.funder.toLowerCase())) return false;
      if (filters.fundingType && !textOf(item, ["fundingType", "instrument"]).includes(filters.fundingType.toLowerCase())) return false;
      if (filters.tag && !textOf(item, ["tags"]).includes(filters.tag.toLowerCase())) return false;
      if (filters.businessStage && !textOf(item, ["businessStage"]).includes(filters.businessStage.toLowerCase())) return false;
      if (!inRange(item.deadline as Date | null, filters.deadlineFrom, filters.deadlineTo) && (filters.deadlineFrom || filters.deadlineTo)) return false;
    }
    if (type === "procurement") {
      if (filters.issuingAuthority && !textOf(item, ["issuingAuthority", "organisation"]).includes(filters.issuingAuthority.toLowerCase())) return false;
      if (filters.value && !textOf(item, ["budget", "valueRange"]).includes(filters.value.toLowerCase())) return false;
      if (filters.category && !textOf(item, ["procurementCategory", "tags"]).includes(filters.category.toLowerCase())) return false;
      if (filters.reference && !textOf(item, ["referenceNumber"]).includes(filters.reference.toLowerCase())) return false;
      if (filters.smme && !textOf(item, ["tags", "summary", "description"]).includes(filters.smme.toLowerCase())) return false;
      if ((filters.closingFrom || filters.closingTo) && !inRange(item.closingDate as Date | null, filters.closingFrom, filters.closingTo)) return false;
    }
    if (type === "programmes") {
      if (filters.audience && !textOf(item, ["audience", "tags"]).includes(filters.audience.toLowerCase())) return false;
      if (filters.ageGroup && !textOf(item, ["ageGroup", "tags"]).includes(filters.ageGroup.toLowerCase())) return false;
      if (filters.skills && !textOf(item, ["skillsCategory", "tags"]).includes(filters.skills.toLowerCase())) return false;
      if (filters.delivery && !textOf(item, ["deliveryMethod", "tags"]).includes(filters.delivery.toLowerCase())) return false;
      if (filters.provider && !textOf(item, ["providerName", "organisation"]).includes(filters.provider.toLowerCase())) return false;
      if (filters.applicationStatus && !textOf(item, ["applicationStatus", "status"]).includes(filters.applicationStatus.toLowerCase())) return false;
      if ((filters.dateFrom || filters.dateTo) && !inRange((item.startDate || item.endDate) as Date | null, filters.dateFrom, filters.dateTo)) return false;
    }
    if (type === "events") {
      if (filters.town && !textOf(item, ["town", "venue"]).includes(filters.town.toLowerCase())) return false;
      if (filters.category && !textOf(item, ["category", "tags"]).includes(filters.category.toLowerCase())) return false;
      if (filters.host && !textOf(item, ["organisation"]).includes(filters.host.toLowerCase())) return false;
      if (filters.format === "online" && !item.onlineUrl) return false;
      if (filters.format === "in-person" && item.onlineUrl && !item.venue) return false;
      if (filters.cost === "free" && textOf(item, ["cost", "tags"]).includes("paid")) return false;
      if (filters.cost === "paid" && !textOf(item, ["cost", "tags"]).includes("paid") && textOf(item, ["cost"]).includes("free")) return false;
      if ((filters.dateFrom || filters.dateTo) && !inRange(item.startsAt as Date | null, filters.dateFrom, filters.dateTo)) return false;
    }
    return true;
  });
}
