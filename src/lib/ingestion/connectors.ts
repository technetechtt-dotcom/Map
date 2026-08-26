import { createHash } from "crypto";
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
  sourceUrl?: string | null;
  etag?: string | null;
  contentHash?: string;
};

export type Connector = {
  id: string;
  licence: string;
  file: string;
  urlEnv: string;
  class: "government" | "institutional" | "directory";
  load(): Promise<ConnectorBatch>;
};

export type ConnectorBatch = {
  connector: string;
  licence: string;
  rows: IngestionRecord[];
  sourceVersion: string;
  contentHash: string;
  etag: string | null;
  sourceUrl: string | null;
  retrievedAt: string;
  schemaDrift: boolean;
  driftReason: string | null;
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
          externalId: props.externalId ? String(props.externalId) : props.id ? String(props.id) : undefined,
          sourceUrl: props.sourceUrl ? String(props.sourceUrl) : props.url ? String(props.url) : undefined,
        } satisfies ImportSourceRow;
      });
    }
  }
  throw new Error("ingestion payload must be a JSON array, { records: [] }, or a GeoJSON FeatureCollection");
}

export function trueSourceVersion(input: { etag?: string | null; lastModified?: string | null; contentHash: string }) {
  const etag = (input.etag || "").replace(/^W\//, "").replace(/"/g, "").trim();
  if (etag) return etag;
  if (input.lastModified) return input.lastModified;
  return input.contentHash.slice(0, 16);
}

type LoadedCatalog = {
  payload: unknown;
  sourceUrl: string | null;
  etag: string | null;
  contentHash: string;
  sourceVersion: string;
};

const REQUIRED_ROW_KEYS = ["name", "latitude", "longitude"];

export function detectSchemaDrift(payload: unknown, rows: ImportSourceRow[]) {
  if (!Array.isArray(payload) && !(payload && typeof payload === "object")) {
    return { schemaDrift: true, driftReason: "payload is not an array or object" };
  }
  if (!rows.length) return { schemaDrift: false, driftReason: null };
  const invalid = rows.filter((row) => !row.name || row.latitude == null || row.longitude == null).length;
  const ratio = invalid / rows.length;
  if (ratio > 0.5) {
    return { schemaDrift: true, driftReason: `${invalid}/${rows.length} rows missing ${REQUIRED_ROW_KEYS.join(",")}` };
  }
  return { schemaDrift: false, driftReason: null };
}

async function loadFromHttp(url: string): Promise<LoadedCatalog> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`connector http ${res.status} ${url}`);
  const text = await res.text();
  const contentHash = createHash("sha256").update(text).digest("hex");
  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");
  return {
    payload: JSON.parse(text),
    sourceUrl: url,
    etag,
    contentHash,
    sourceVersion: trueSourceVersion({ etag, lastModified, contentHash }),
  };
}

async function loadFromFile(file: string): Promise<LoadedCatalog> {
  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const text = await readFile(full, "utf8");
  const contentHash = createHash("sha256").update(text).digest("hex");
  return {
    payload: JSON.parse(text),
    sourceUrl: null,
    etag: null,
    contentHash,
    sourceVersion: trueSourceVersion({ contentHash }),
  };
}

export async function loadConnectorSource(connector: {
  id: string;
  licence: string;
  file: string;
  urlEnv: string;
}): Promise<ConnectorBatch> {
  const started = Date.now();
  const url = (process.env[connector.urlEnv] || "").trim();
  const fileOverride = (process.env[`${connector.urlEnv}_FILE`] || "").trim();
  const loaded = url ? await loadFromHttp(url) : await loadFromFile(fileOverride || connector.file);
  const retrievedAt = new Date().toISOString();
  const rows = asRows(loaded.payload).map((row) => ({
    ...row,
    source: connector.id,
    retrievedAt,
    sourceVersion: loaded.sourceVersion,
    sourceUrl: loaded.sourceUrl || row.sourceUrl || null,
    etag: loaded.etag,
    contentHash: loaded.contentHash,
    confidence: "public-directory",
    licence: connector.licence,
    verificationStatus: "unverified-directory" as const,
    verificationTier: "directory" as const,
  }));
  const drift = detectSchemaDrift(loaded.payload, rows);
  log.info("ingestion.connector", {
    id: connector.id,
    kind: url ? "http" : "file",
    rows: rows.length,
    sourceVersion: loaded.sourceVersion,
    schemaDrift: drift.schemaDrift,
    latencyMs: Date.now() - started,
  });
  return {
    connector: connector.id,
    licence: connector.licence,
    rows: drift.schemaDrift ? [] : rows,
    sourceVersion: loaded.sourceVersion,
    contentHash: loaded.contentHash,
    etag: loaded.etag,
    sourceUrl: loaded.sourceUrl,
    retrievedAt,
    schemaDrift: drift.schemaDrift,
    driftReason: drift.driftReason,
  };
}

function defineConnector(
  id: string,
  licence: string,
  file: string,
  urlEnv: string,
  cls: Connector["class"] = "directory"
): Connector {
  return {
    id,
    licence,
    file,
    urlEnv,
    class: cls,
    load: () => loadConnectorSource({ id, licence, file, urlEnv }),
  };
}

export const CONNECTORS: Connector[] = [
  defineConnector("provincial-government", "public-directory", "data/ingestion/provincial-government.json", "INGEST_PROVINCIAL_GOVERNMENT_URL", "government"),
  defineConnector("municipalities", "public-directory", "data/ingestion/municipalities.json", "INGEST_MUNICIPALITIES_URL", "government"),
  defineConnector("universities", "public-directory", "data/ingestion/universities.json", "INGEST_UNIVERSITIES_URL", "institutional"),
  defineConnector("tvet", "public-directory", "data/ingestion/tvet.json", "INGEST_TVET_URL", "institutional"),
  defineConnector("seta-funders", "public-directory", "data/ingestion/seta-funders.json", "INGEST_SETA_FUNDERS_URL", "institutional"),
  defineConnector("research-institutions", "public-directory", "data/ingestion/research-institutions.json", "INGEST_RESEARCH_INSTITUTIONS_URL", "institutional"),
  defineConnector("innovation-hubs", "public-directory", "data/ingestion/innovation-hubs.json", "INGEST_INNOVATION_HUBS_URL", "institutional"),
  defineConnector("funders", "public-directory", "data/ingestion/funders.json", "INGEST_FUNDERS_URL", "institutional"),
  defineConnector("programmes", "public-directory", "data/ingestion/programmes.json", "INGEST_PROGRAMMES_URL", "institutional"),
  defineConnector("procurement", "public-directory", "data/ingestion/procurement.json", "INGEST_PROCUREMENT_URL", "government"),
  defineConnector("digital-infrastructure", "public-directory", "data/ingestion/digital-infrastructure.json", "INGEST_DIGITAL_INFRASTRUCTURE_URL", "government"),
  defineConnector("industry-bodies", "public-directory", "data/ingestion/industry-bodies.json", "INGEST_INDUSTRY_BODIES_URL", "institutional"),
  defineConnector("companies", "public-directory", "data/ingestion/companies.json", "INGEST_COMPANIES_URL", "directory"),
];

export async function loadNationalCatalog() {
  const batches: ConnectorBatch[] = [];
  for (const connector of CONNECTORS) {
    try {
      batches.push(await connector.load());
    } catch (error) {
      log.error("ingestion.connector.failed", {
        id: connector.id,
        detail: error instanceof Error ? error.message : String(error),
      });
      batches.push({
        connector: connector.id,
        licence: connector.licence,
        rows: [],
        sourceVersion: "",
        contentHash: "",
        etag: null,
        sourceUrl: null,
        retrievedAt: new Date().toISOString(),
        schemaDrift: true,
        driftReason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return batches;
}
