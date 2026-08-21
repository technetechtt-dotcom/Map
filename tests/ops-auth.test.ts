import { describe, expect, it } from "vitest";
import { authorizeBearerOrHeader, authorizeJobRole } from "@/lib/ops-auth";
import { parseNearbyQuery } from "@/lib/validation";
import { publicHealthFromMetrics } from "@/lib/metrics";

describe("metrics fail-closed auth", () => {
  it("rejects production when the secret is missing", () => {
    const result = authorizeBearerOrHeader({ provided: "", secret: "", production: true, missingSecretError: "Metrics not configured" });
    expect(result).toEqual({ ok: false, status: 503, error: "Metrics not configured" });
  });

  it("rejects a mismatched token", () => {
    const result = authorizeBearerOrHeader({ provided: "wrong", secret: "correct-token", production: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("accepts a matching token", () => {
    expect(authorizeBearerOrHeader({ provided: "correct-token", secret: "correct-token", production: true }).ok).toBe(true);
  });
});

describe("maintenance job roles", () => {
  const superAdmin = { id: "s1", role: "SUPER_ADMIN" };
  const provincial = { id: "p1", role: "PROVINCIAL_ADMIN", provinceId: "prov-a" };
  const orgAdmin = { id: "o1", role: "ORG_ADMIN", organisationId: "org-a", provinceId: "prov-a" };

  it("allows super admins to prune and backup", () => {
    expect(authorizeJobRole(superAdmin, "prune").ok).toBe(true);
    expect(authorizeJobRole(superAdmin, "backup").ok).toBe(true);
  });

  it("blocks provincial admins from global prune/backup and scopes tenant jobs", () => {
    expect(authorizeJobRole(provincial, "prune").ok).toBe(false);
    expect(authorizeJobRole(provincial, "backup").ok).toBe(false);
    expect(authorizeJobRole(provincial, "all").ok).toBe(false);
    expect(authorizeJobRole(provincial, "expiry")).toEqual({ ok: true, provinceId: "prov-a" });
  });

  it("blocks org admins from maintenance jobs", () => {
    expect(authorizeJobRole(orgAdmin, "expiry").ok).toBe(false);
  });
});

describe("nearby query validation", () => {
  it("rejects missing coordinates instead of coercing to 0,0", () => {
    expect(parseNearbyQuery({ lat: null, lng: null }).ok).toBe(false);
    expect(parseNearbyQuery({ lat: "", lng: "" }).ok).toBe(false);
  });

  it("rejects out-of-range coordinates and radius", () => {
    expect(parseNearbyQuery({ lat: "99", lng: "18" }).ok).toBe(false);
    expect(parseNearbyQuery({ lat: "-28.7", lng: "24.7", radiusKm: "999" }).ok).toBe(false);
    expect(parseNearbyQuery({ lat: "-28.7", lng: "24.7", radiusKm: "abc" }).ok).toBe(false);
  });

  it("accepts valid Northern Cape coordinates", () => {
    expect(parseNearbyQuery({ lat: "-28.7", lng: "24.7", radiusKm: "25" })).toEqual({
      ok: true,
      lat: -28.7,
      lng: 24.7,
      radiusKm: 25,
    });
  });
});

describe("public health projection", () => {
  it("omits backup checksums and worker ids", () => {
    const publicHealth = publicHealthFromMetrics({
      collectedAt: new Date().toISOString(),
      latencyMs: 1,
      dbLatencyMs: 1,
      queue: { pending: 2, running: 1, failed: 0, deadLetter: 0 },
      notifications: { failed: 0 },
      verification: { expired: 3 },
      backup: { ageHours: 1, stale: false, checksum: "secret-checksum", objectsCopied: 4, rpoMinutes: 1440, rtoMinutes: 120 },
      worker: { workerId: "worker-1", lastSeenAt: new Date(), queueDepth: 2, healthy: true },
    });
    expect(JSON.stringify(publicHealth)).not.toContain("secret-checksum");
    expect(JSON.stringify(publicHealth)).not.toContain("worker-1");
    expect(publicHealth.backup?.stale).toBe(false);
    expect(publicHealth.worker.healthy).toBe(true);
  });
});
