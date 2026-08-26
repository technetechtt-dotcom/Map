export type SourceClass =
  | "field-reviewer"
  | "desktop-reviewer"
  | "government"
  | "institutional"
  | "organisation"
  | "community"
  | "directory";

export const SOURCE_AUTHORITY: Record<SourceClass, number> = {
  "field-reviewer": 100,
  "desktop-reviewer": 80,
  government: 70,
  institutional: 60,
  organisation: 50,
  community: 30,
  directory: 10,
};

const CONNECTOR_CLASS: Record<string, SourceClass> = {
  "provincial-government": "government",
  municipalities: "government",
  universities: "institutional",
  tvet: "institutional",
  "seta-funders": "institutional",
  "research-institutions": "institutional",
  "innovation-hubs": "institutional",
  funders: "institutional",
  programmes: "institutional",
  procurement: "government",
  "digital-infrastructure": "government",
  "industry-bodies": "institutional",
  companies: "directory",
  community: "community",
  organisation: "organisation",
};

export const TRUSTED_FIELDS = ["name", "summary", "address", "website", "latitude", "longitude"] as const;
export type TrustedField = (typeof TRUSTED_FIELDS)[number];

export function sourceClassFor(input: { connector?: string | null; verificationTier?: string | null }): SourceClass {
  const tier = input.verificationTier || "";
  if (tier === "field") return "field-reviewer";
  if (tier === "desktop") return "desktop-reviewer";
  return CONNECTOR_CLASS[input.connector || ""] || "directory";
}

export function authorityFor(input: { connector?: string | null; verificationTier?: string | null }) {
  return SOURCE_AUTHORITY[sourceClassFor(input)];
}

export function shouldAcceptField(existingAuthority: number | null | undefined, incomingAuthority: number) {
  if (existingAuthority == null) return true;
  return incomingAuthority >= existingAuthority;
}
