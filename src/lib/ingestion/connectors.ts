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

export async function loadConnectorSource(connector: { id: string; licence: string; file: string; urlEnv: string }): Promise<IngestionRecord[]> {
  const url = (process.env[connector.urlEnv] || "").trim();
  const fileOverride = (process.env[`${connector.urlEnv}_FILE`] || "").trim();
  const loaded = url ? await loadFromHttp(url) : await loadFromFile(fileOverride || connector.file);
  const retrievedAt = new Date().toISOString().slice(0, 10);
  return asRows(loaded.payload).map((row) => ({
    ...row,
    source: connector.id,
    retrievedAt,
    sourceVersion: loaded.sourceVersion,
    sourceUrl: loaded.sourceUrl || row.sourceUrl || null,
    etag: loaded.etag,
    contentHash: loaded.contentHash,
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
