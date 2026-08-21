import type { ImportSourceRow } from "../import-apply";
import { log } from "../logger";

export type IngestionRecord = ImportSourceRow & {
  source: string;
  retrievedAt: string;
  sourceVersion: string;
  confidence: string;
  verificationStatus: "unverified-directory" | "historical" | "verified";
};

export type Connector = {
  id: string;
  licence: string;
  load(): Promise<IngestionRecord[]>;
};

function directory(
  source: string,
  rows: Array<ImportSourceRow & { retrievedAt?: string; sourceVersion?: string }>
): IngestionRecord[] {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  return rows.map((row) => ({
    ...row,
    source,
    retrievedAt: row.retrievedAt || retrievedAt,
    sourceVersion: row.sourceVersion || `${source}-${retrievedAt}`,
    confidence: "public-directory",
    verificationStatus: "unverified-directory",
  }));
}

export async function provincialGovernmentConnector(): Promise<IngestionRecord[]> {
  return directory("provincial-government", [
    { name: "Western Cape Government", provinceSlug: "western-cape", latitude: -33.925, longitude: 18.424, categorySlug: "knowledge-hub", summary: "Provincial government digital services." },
    { name: "Gauteng Provincial Government", provinceSlug: "gauteng", latitude: -25.746, longitude: 28.188, categorySlug: "knowledge-hub", summary: "Provincial government digital services." },
  ]);
}

export async function universityConnector(): Promise<IngestionRecord[]> {
  return directory("universities", [
    { name: "University of the Witwatersrand", provinceSlug: "gauteng", latitude: -26.191, longitude: 28.03, categorySlug: "skills-education", summary: "Public university." },
    { name: "University of Cape Town", provinceSlug: "western-cape", latitude: -33.957, longitude: 18.461, categorySlug: "skills-education", summary: "Public university." },
  ]);
}

export async function tvetConnector(): Promise<IngestionRecord[]> {
  return directory("tvet", [
    { name: "Ehlanzeni TVET College", provinceSlug: "mpumalanga", latitude: -25.465, longitude: 30.985, categorySlug: "skills-education", summary: "Public TVET college." },
  ]);
}

export async function setaFunderConnector(): Promise<IngestionRecord[]> {
  return directory("seta-funders", [
    { name: "MICT SETA", provinceSlug: "gauteng", latitude: -26.107, longitude: 28.057, categorySlug: "skills-education", summary: "Sector education and training authority for ICT." },
    { name: "Technology Innovation Agency", provinceSlug: "gauteng", latitude: -25.747, longitude: 28.277, categorySlug: "knowledge-hub", summary: "Public innovation funding agency." },
  ]);
}

export const CONNECTORS: Connector[] = [
  { id: "provincial-government", licence: "public-directory", load: provincialGovernmentConnector },
  { id: "universities", licence: "public-directory", load: universityConnector },
  { id: "tvet", licence: "public-directory", load: tvetConnector },
  { id: "seta-funders", licence: "public-directory", load: setaFunderConnector },
];

export async function loadNationalCatalog() {
  const batches = [];
  for (const connector of CONNECTORS) {
    const rows = await connector.load();
    log.info("ingestion.connector", { id: connector.id, rows: rows.length });
    batches.push({ connector: connector.id, licence: connector.licence, rows });
  }
  return batches;
}
