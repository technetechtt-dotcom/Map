/**
 * Rate limiter: in-memory by default.
 * Optional Upstash Redis REST for multi-instance (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 * File-backed counters optional via RATE_LIMIT_FILE for single-node persistence across restarts.
 *
 * Upstash POST /pipeline returns an array of { result } objects, not { result: [...] }.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { log } from "./logger";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number; retryAfterSec: number };

function memoryLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    buckets.set(key, { count: 1, resetAt });
    persistFile(key, 1, resetAt);
    return { ok: true, remaining: opts.limit - 1, resetAt };
  }
  if (existing.count >= opts.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  buckets.set(key, existing);
  persistFile(key, existing.count, existing.resetAt);
  return {
    ok: true,
    remaining: opts.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

function filePath() {
  const dir = process.env.RATE_LIMIT_FILE
    ? path.dirname(process.env.RATE_LIMIT_FILE)
    : path.join(process.cwd(), "data", "rate-limit");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return process.env.RATE_LIMIT_FILE || path.join(dir, "buckets.json");
}

function loadFileStore(): Record<string, Bucket> {
  try {
    if (!process.env.RATE_LIMIT_FILE && process.env.RATE_LIMIT_PERSIST !== "1") return {};
    const p = filePath();
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, Bucket>;
  } catch {
    return {};
  }
}

function persistFile(key: string, count: number, resetAt: number) {
  if (!process.env.RATE_LIMIT_FILE && process.env.RATE_LIMIT_PERSIST !== "1") return;
  try {
    const store = loadFileStore();
    store[key] = { count, resetAt };
    const now = Date.now();
    for (const k of Object.keys(store)) {
      if (store[k].resetAt <= now) delete store[k];
    }
    writeFileSync(filePath(), JSON.stringify(store));
  } catch {
    // non-fatal
  }
}

let hydrated = false;
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const store = loadFileStore();
  const now = Date.now();
  for (const [k, v] of Object.entries(store)) {
    if (v.resetAt > now) buckets.set(k, v);
  }
}

function pipelineEntry(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    // Redis RESP: [error, result] or [null, result]
    return value.length >= 2 ? value[1] : value[0];
  }
  if (typeof value === "object" && value && "result" in value) {
    return (value as { result: unknown }).result;
  }
  if (typeof value === "object" && value && "error" in value) {
    return undefined;
  }
  return value;
}

/**
 * Parse Upstash REST /pipeline JSON.
 * Canonical: [{ result: 1 }, { result: 1 }, { result: 60 }]
 * Also accepts { result: [1, 1, 60] } and RESP tuples.
 */
export function parseUpstashPipeline(data: unknown): { count: number; ttl: number } | null {
  if (data == null) return null;
  let countRaw: unknown;
  let ttlRaw: unknown;

  if (Array.isArray(data)) {
    if (data.length !== 3) return null;
    if (data.some((entry) => typeof entry === "object" && entry && "error" in entry)) return null;
    countRaw = pipelineEntry(data[0]);
    ttlRaw = pipelineEntry(data[2]);
  } else if (typeof data === "object" && data && "result" in data) {
    const result = (data as { result: unknown }).result;
    if (!Array.isArray(result) || result.length !== 3) return null;
    countRaw = pipelineEntry(result[0]);
    ttlRaw = pipelineEntry(result[2]);
  } else {
    return null;
  }

  const count = Number(countRaw);
  if (!Number.isSafeInteger(count) || count < 1) return null;
  const ttl = Number(ttlRaw);
  if (!Number.isSafeInteger(ttl) || ttl < 1) return null;
  return { count, ttl };
}

export type UpstashFetch = typeof fetch;

async function upstashLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  fetchImpl: UpstashFetch = fetch
): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const bucketKey = `rl:${key}`;
  const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000));

  try {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", bucketKey],
        ["EXPIRE", bucketKey, windowSec, "NX"],
        ["TTL", bucketKey],
      ]),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      log.error("rate_limit.redis_http_error", { status: res.status });
      return null;
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      log.error("rate_limit.redis_malformed_json");
      return null;
    }
    const parsed = parseUpstashPipeline(data);
    if (!parsed) {
      log.error("rate_limit.redis_malformed_response");
      return null;
    }
    const resetAt = Date.now() + Math.max(1, parsed.ttl) * 1000;
    if (parsed.count > opts.limit) {
      return {
        ok: false,
        remaining: 0,
        resetAt,
        retryAfterSec: Math.max(1, parsed.ttl),
      };
    }
    return { ok: true, remaining: Math.max(0, opts.limit - parsed.count), resetAt };
  } catch (error) {
    log.error("rate_limit.redis_unavailable", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  hydrate();
  return memoryLimit(key, opts);
}

function failClosed(): RateLimitResult {
  return {
    ok: false,
    remaining: 0,
    resetAt: Date.now() + 30_000,
    retryAfterSec: 30,
  };
}

function isCiE2eRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.E2E === "1") return true;
  return Boolean(env.CI && env.CI !== "0" && env.CI !== "false");
}

/** Async limit that tries Upstash first. Production fails closed if Redis is required and missing. */
export async function rateLimitAsync(
  key: string,
  opts: { limit: number; windowMs: number },
  fetchImpl?: UpstashFetch
): Promise<RateLimitResult> {
  const remote = await upstashLimit(key, opts, fetchImpl ?? fetch);
  if (remote) return remote;
  const prod = process.env.NODE_ENV === "production";
  // Production must never silently fall back to a per-instance limiter: it
  // would let an attacker bypass limits by changing application instances.
  // CI/e2e may opt into memory buckets with RATE_LIMIT_ALLOW_MEMORY=1.
  if (prod && !(isCiE2eRuntime() && process.env.RATE_LIMIT_ALLOW_MEMORY === "1")) {
    return failClosed();
  }
  const ciLimit = isCiE2eRuntime() ? Math.max(opts.limit, 10_000) : opts.limit;
  return rateLimit(key, { ...opts, limit: ciLimit });
}

export function resetMemoryBucketsForTests() {
  buckets.clear();
  hydrated = false;
}

setInterval(() => {
  const now = Date.now();
  Array.from(buckets.entries()).forEach(([k, b]) => {
    if (b.resetAt <= now) buckets.delete(k);
  });
}, 60_000).unref?.();
