import { readFile } from "fs/promises";
import path from "path";
import type { ImportSourceRow } from "../import-apply";
import { log } from "../logger";

export type IngestionRecord = ImportSourceRow & {
  source: string;
  retrievedAt: string;
  sourceVersion: string;
  confidence: string;
  licence: string;
  verificationStatus: "unverified-directory" | "historical" | "verified";
  verificationTier: "directory";
};

export type Connector = {
  id: string;
  licence: string;
  file: string;
  urlEnv: string;
  load(): Promise<IngestionRecord[]>;
};

export function asRows(payload: unknown): ImportSourceRow[] {
  if (Array.isArray(payload)) return payload as ImportSourceRow[];
  if (payload && typeof payload === "object") {
    const record = payload as { records?: unknown; type?: string; features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }> };
    if (Array.isArray(record.records)) return record.records as ImportSourceRow[];
    if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
      return record.features.map((feature) => {
        const props = feature.properties || {};
        const coords = feature.geometry?.coordinates || [];
        return {
          name: String(props.name || props.title || ""),
          summary: props.summary ? String(props.summary) : undefined,
          latitude: typeof coords[1] === "number" ? coords[1] : typeof props.latitude === "number" || typeof props.latitude === "string" ? props.latitude : undefined,
          longitude: typeof coords[0] === "number" ? coords[0] : typeof props.longitude === "number" || typeof props.longitude === "string" ? props.longitude : undefined,
          provinceSlug: props.provinceSlug ? String(props.provinceSlug) : undefined,
          categorySlug: props.categorySlug ? String(props.categorySlug) : undefined,
          website: props.website ? String(props.website) : undefined,
          address: props.address ? String(props.address) : undefined,
        } satisfies ImportSourceRow;
      });
    }
  }
  throw new Error("ingestion payload must be a JSON array, { records: [] }, or a GeoJSON FeatureCollection");
}

async function loadFromHttp(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`connector http ${res.status} ${url}`);
  return res.json();
}

async function loadFromFile(file: string): Promise<unknown> {
  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  return JSON.parse(await readFile(full, "utf8"));
}

export async function loadConnectorSource(connector: { id: string; licence: string; file: string; urlEnv: string }): Promise<IngestionRecord[]> {
  const url = (process.env[connector.urlEnv] || "").trim();
  const fileOverride = (process.env[`${connector.urlEnv}_FILE`] || "").trim();
  const payload = url ? await loadFromHttp(url) : await loadFromFile(fileOverride || connector.file);
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const sourceVersion = `${connector.id}-${retrievedAt}`;
  return asRows(payload).map((row) => ({
    ...row,
    source: connector.id,
    retrievedAt,
    sourceVersion,
    confidence: "public-directory",
    licence: connector.licence,
    verificationStatus: "unverified-directory",
    verificationTier: "directory",
  }));
}

function defineConnector(id: string, licence: string, file: string, urlEnv: string): Connector {
  return {
    id,
    licence,
    file,
    urlEnv,
    load: () => loadConnectorSource({ id, licence, file, urlEnv }),
  };
}

export const CONNECTORS: Connector[] = [
  defineConnector("provincial-government", "public-directory", "data/ingestion/provincial-government.json", "INGEST_PROVINCIAL_GOVERNMENT_URL"),
  defineConnector("universities", "public-directory", "data/ingestion/universities.json", "INGEST_UNIVERSITIES_URL"),
  defineConnector("tvet", "public-directory", "data/ingestion/tvet.json", "INGEST_TVET_URL"),
  defineConnector("seta-funders", "public-directory", "data/ingestion/seta-funders.json", "INGEST_SETA_FUNDERS_URL"),
];

export async function loadNationalCatalog() {
  const batches = [];
  for (const connector of CONNECTORS) {
    const rows = await connector.load();
    log.info("ingestion.connector", { id: connector.id, kind: process.env[connector.urlEnv] ? "http" : "file", rows: rows.length });
    batches.push({ connector: connector.id, licence: connector.licence, rows });
  }
  return batches;
}
