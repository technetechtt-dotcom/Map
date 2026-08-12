/**
 * Rate limiter: in-memory by default.
 * Optional Upstash Redis REST for multi-instance (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 * File-backed counters optional via RATE_LIMIT_FILE for single-node persistence across restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

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

// hydrate memory from disk once
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

async function upstashLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const bucketKey = `rl:${key}`;
  const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000));

  try {
    // INCR + EXPIRE via pipeline
    const res = await fetch(`${url}/pipeline`, {
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
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: [number, unknown, number] };
    const count = Number(data?.result?.[0] ?? 0);
    const ttl = Number(data?.result?.[2] ?? windowSec);
    const resetAt = Date.now() + Math.max(1, ttl) * 1000;
    if (count > opts.limit) {
      return {
        ok: false,
        remaining: 0,
        resetAt,
        retryAfterSec: Math.max(1, ttl),
      };
    }
    return { ok: true, remaining: Math.max(0, opts.limit - count), resetAt };
  } catch {
    return null;
  }
}

/**
 * Synchronous rate limit (memory/file). Prefer rateLimitAsync when Upstash may be configured.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  hydrate();
  return memoryLimit(key, opts);
}

/** Async limit that tries Upstash first. Production fails closed if Redis is required and missing. */
export async function rateLimitAsync(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const remote = await upstashLimit(key, opts);
  if (remote) return remote;
  const prod = process.env.NODE_ENV === "production";
  const redisConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
  if (prod && redisConfigured && process.env.RATE_LIMIT_FAIL_OPEN !== "1") {
    return {
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSec: 30,
    };
  }
  if (prod && !redisConfigured && process.env.RATE_LIMIT_ALLOW_MEMORY !== "1") {
    return {
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSec: 30,
    };
  }
  return rateLimit(key, opts);
}

setInterval(() => {
  const now = Date.now();
  Array.from(buckets.entries()).forEach(([k, b]) => {
    if (b.resetAt <= now) buckets.delete(k);
  });
}, 60_000).unref?.();
