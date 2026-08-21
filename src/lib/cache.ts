import { log } from "./logger";

const memory = new Map<string, { value: string; expiresAt: number }>();

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export async function cacheGet(key: string): Promise<string | null> {
  const remote = upstash();
  if (remote) {
    try {
      const res = await fetch(`${remote.url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${remote.token}` },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { result?: string | null };
      return json.result ?? null;
    } catch (error) {
      log.warn("cache.redis_get_failed", { detail: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
  const hit = memory.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export async function cacheSet(key: string, value: string, ttlSec: number): Promise<void> {
  const remote = upstash();
  if (remote) {
    try {
      await fetch(`${remote.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${Math.max(1, ttlSec)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${remote.token}` },
        signal: AbortSignal.timeout(2500),
      });
      return;
    } catch (error) {
      log.warn("cache.redis_set_failed", { detail: error instanceof Error ? error.message : String(error) });
    }
  }
  memory.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSec) * 1000 });
}

export async function cacheDel(key: string): Promise<void> {
  const remote = upstash();
  if (remote) {
    try {
      await fetch(`${remote.url}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${remote.token}` },
        signal: AbortSignal.timeout(2500),
      });
    } catch (error) {
      log.warn("cache.redis_del_failed", { detail: error instanceof Error ? error.message : String(error) });
    }
  }
  memory.delete(key);
}

export function sessionVersionCacheKey(userId: string) {
  return `session-version:${userId}`;
}
