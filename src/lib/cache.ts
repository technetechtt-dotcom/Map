import { log } from "./logger";

const memory = new Map<string, { value: string; expiresAt: number }>();

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function allowMemoryFallback(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" || env.E2E === "1";
}

export type CacheRead =
  | { ok: true; value: string | null }
  | { ok: false; reason: "redis-error" | "unconfigured" };

export async function cacheGet(key: string): Promise<string | null> {
  const result = await cacheGetResult(key);
  return result.ok ? result.value : null;
}

export async function cacheGetResult(key: string): Promise<CacheRead> {
  const remote = upstash();
  if (remote) {
    try {
      const res = await fetch(`${remote.url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${remote.token}` },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) {
        log.warn("cache.redis_get_http", { status: res.status });
        return { ok: false, reason: "redis-error" };
      }
      const json = (await res.json()) as { result?: string | null };
      return { ok: true, value: json.result ?? null };
    } catch (error) {
      log.warn("cache.redis_get_failed", { detail: error instanceof Error ? error.message : String(error) });
      return { ok: false, reason: "redis-error" };
    }
  }
  if (!allowMemoryFallback()) return { ok: false, reason: "unconfigured" };
  const hit = memory.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    memory.delete(key);
    return { ok: true, value: null };
  }
  return { ok: true, value: hit.value };
}

export async function cacheSet(key: string, value: string, ttlSec: number): Promise<boolean> {
  const remote = upstash();
  if (remote) {
    try {
      const res = await fetch(`${remote.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${Math.max(1, ttlSec)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${remote.token}` },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) {
        log.warn("cache.redis_set_http", { status: res.status });
        return false;
      }
      return true;
    } catch (error) {
      log.warn("cache.redis_set_failed", { detail: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  if (!allowMemoryFallback()) return false;
  memory.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSec) * 1000 });
  return true;
}

export async function cacheDel(key: string): Promise<boolean> {
  const remote = upstash();
  memory.delete(key);
  if (remote) {
    try {
      const res = await fetch(`${remote.url}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${remote.token}` },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) {
        log.warn("cache.redis_del_http", { status: res.status });
        return false;
      }
      return true;
    } catch (error) {
      log.warn("cache.redis_del_failed", { detail: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  return allowMemoryFallback();
}

export function sessionVersionCacheKey(userId: string) {
  return `session-version:${userId}`;
}

export function geocodeCacheKey(query: string) {
  return `geocode:${query.trim().toLowerCase()}`;
}
