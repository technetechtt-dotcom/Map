import { afterEach, describe, expect, it } from "vitest";
import { cacheDel, cacheGet, cacheSet, sessionVersionCacheKey } from "@/lib/cache";

describe("process cache fallback", () => {
  const saved = {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };

  afterEach(() => {
    if (saved.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = saved.url;
    if (saved.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
  });

  it("round-trips when Redis is not configured", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const key = sessionVersionCacheKey(`test-${Date.now()}`);
    expect(await cacheSet(key, "7", 30)).toBe(true);
    expect(await cacheGet(key)).toBe("7");
    expect(await cacheDel(key)).toBe(true);
    expect(await cacheGet(key)).toBeNull();
  });
});
