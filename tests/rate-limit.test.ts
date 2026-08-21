import { afterEach, describe, expect, it } from "vitest";
import { parseUpstashPipeline, rateLimitAsync, resetMemoryBucketsForTests } from "@/lib/rate-limit";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  resetMemoryBucketsForTests();
});

describe("Upstash distributed rate limiting", () => {
  it("parses the canonical /pipeline response", () => {
    expect(parseUpstashPipeline([{ result: 2 }, { result: 1 }, { result: 59 }])).toEqual({ count: 2, ttl: 59 });
  });

  it.each([
    null,
    {},
    [{ result: 1 }],
    [{ result: 0 }, { result: 1 }, { result: 10 }],
    [{ result: 1 }, { result: 1 }, { result: -1 }],
    [{ error: "ERR" }, { result: 1 }, { result: 10 }],
  ])("rejects malformed Redis responses", (payload) => {
    expect(parseUpstashPipeline(payload)).toBeNull();
  });

  it("fails closed in production when Redis is unavailable", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.E2E;
    delete process.env.RATE_LIMIT_ALLOW_MEMORY;
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-that-is-long-enough";
    const result = await rateLimitAsync("login:test", { limit: 5, windowMs: 60_000 }, async () => {
      throw new Error("offline");
    });
    expect(result.ok).toBe(false);
  });

  it("uses memory buckets in CI e2e when RATE_LIMIT_ALLOW_MEMORY is set", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.E2E = "1";
    process.env.RATE_LIMIT_ALLOW_MEMORY = "1";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const first = await rateLimitAsync("login:ci-e2e", { limit: 2, windowMs: 60_000 });
    const second = await rateLimitAsync("login:ci-e2e", { limit: 2, windowMs: 60_000 });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("shares counters returned by Redis across callers", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-that-is-long-enough";
    let count = 0;
    const fetchMock = async () =>
      new Response(JSON.stringify([{ result: ++count }, { result: 1 }, { result: 60 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    expect((await rateLimitAsync("login:shared", { limit: 1, windowMs: 60_000 }, fetchMock)).ok).toBe(true);
    expect((await rateLimitAsync("login:shared", { limit: 1, windowMs: 60_000 }, fetchMock)).ok).toBe(false);
  });
});

const integration = process.env.UPSTASH_INTEGRATION === "1" ? it : it.skip;
integration("uses a real Upstash pipeline when integration credentials are supplied", async () => {
  const key = `integration:${Date.now()}:${Math.random()}`;
  expect((await rateLimitAsync(key, { limit: 1, windowMs: 10_000 })).ok).toBe(true);
  expect((await rateLimitAsync(key, { limit: 1, windowMs: 10_000 })).ok).toBe(false);
});
