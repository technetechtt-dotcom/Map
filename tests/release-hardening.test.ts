import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { canonicalizeMemoKey, invalidatePublicCaches, memoizeAsync } from "@/lib/server-memo";
import { authorityFor, shouldAcceptField, sourceClassFor } from "@/lib/ingestion/authority";
import { detectSchemaDrift } from "@/lib/ingestion/connectors";
import { selectVerificationRows } from "@/lib/object-backup";
import { nationalCanonicalId } from "@/lib/ingestion/registry";

describe("bounded public cache", () => {
  it("canonicalizes query keys and evicts with LRU", async () => {
    expect(canonicalizeMemoKey("?b=2&a=1")).toBe("?a=1&b=2");
    const memo = memoizeAsync<number>("test-lru", 60_000);
    expect(await memo("?b=2&a=1", async () => 1)).toBe(1);
    expect(memo.peek("?a=1&b=2")).toBe(1);
    invalidatePublicCaches(["test-lru"]);
    expect(memo.peek("?a=1&b=2")).toBeUndefined();
  });
});

describe("source authority", () => {
  it("ranks field reviewers above directories", () => {
    expect(sourceClassFor({ verificationTier: "field" })).toBe("field-reviewer");
    expect(authorityFor({ connector: "universities" })).toBe(60);
    expect(authorityFor({ connector: "provincial-government" })).toBe(70);
    expect(shouldAcceptField(80, 10)).toBe(false);
    expect(shouldAcceptField(10, 70)).toBe(true);
  });
});

describe("schema drift quarantine", () => {
  it("quarantines catalogs that lost required fields", () => {
    const drift = detectSchemaDrift([{ title: "no coords" }, { title: "still none" }], [
      { name: "", latitude: undefined, longitude: undefined },
      { name: "", latitude: undefined, longitude: undefined },
    ]);
    expect(drift.schemaDrift).toBe(true);
  });
});

describe("object backup sampling", () => {
  it("does not hash every historical object on a daily sample", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), backupKey: `k-${i}` }));
    expect(selectVerificationRows(rows, "sample").length).toBeLessThan(rows.length);
    expect(selectVerificationRows(rows, "full").length).toBe(100);
  });
});

describe("national entity ids", () => {
  it("prefers registration numbers then domains", () => {
    expect(nationalCanonicalId({ entityType: "organisation", registrationNumber: "K123", name: "Example" })).toContain("reg:k123");
    expect(nationalCanonicalId({ entityType: "organisation", domain: "example.gov.za", name: "Example" })).toContain("domain:example.gov.za");
  });
});

describe("security scanners", () => {
  it("requires both public and ops origins in production deploy preflight", () => {
    const src = readFileSync(path.join(process.cwd(), "scripts/ops-preflight.js"), "utf8");
    expect(src).toContain('const DEPLOY_REQUIRED = ["PRODUCTION_APP_URL", "OPS_APP_URL"]');
  });

  it("requires both database URLs for a complete off-site backup", () => {
    const src = readFileSync(path.join(process.cwd(), "scripts/ops-preflight.js"), "utf8");
    expect(src).toContain('"PRODUCTION_DIRECT_URL"');
    expect(src).toContain('"PRODUCTION_DATABASE_URL"');
  });

  it("launch governance requires every PR-only security and signature check", () => {
    const policy = JSON.parse(
      readFileSync(path.join(process.cwd(), "docs/branch-protection-launch.json"), "utf8")
    );
    expect(policy.required_status_checks.contexts).toEqual(
      expect.arrayContaining(["dependency-review", "signed-commits"])
    );
    expect(policy.required_pull_request_reviews.require_code_owner_reviews).toBe(true);
    expect(policy.required_signatures).toBe(true);
  });

  it("reports the Render-provided commit in privileged health", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/api/health/route.ts"), "utf8");
    expect(src).toContain("process.env.RENDER_GIT_COMMIT");
  });

  it("groups cluster geometry through one stable grid expression", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/locations/clusters/route.ts"),
      "utf8"
    );
    expect(src).toContain("WITH gridded AS");
    expect(src).toContain("GROUP BY cell");
    expect(src.match(/\$\{cellSize\}/g)).toHaveLength(1);
  });

  it("runs each formal k6 profile by LOAD_PROFILE", () => {
    const src = readFileSync(
      path.join(process.cwd(), "scripts/staging-load-certification.js"),
      "utf8"
    );
    expect(src).toContain("`LOAD_PROFILE=${profile}`");
    expect(src).not.toContain("`VUS=${profile}`");
  });

  it("exercises authenticated load against a separately built ops app", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/load-test.yml"),
      "utf8"
    );
    expect(workflow).toContain("APP_PLATFORM=public NEXT_DIST_DIR=.next-public");
    expect(workflow).toContain("APP_PLATFORM=ops NEXT_DIST_DIR=.next-ops");
    expect(workflow).toContain("OPS_APP_URL: http://127.0.0.1:3001");
  });

  it("does not allowlist Next.js in the dependency audit", () => {
    const src = readFileSync(path.join(process.cwd(), "scripts/ci-audit.js"), "utf8");
    expect(src).not.toMatch(/allowed = new Set\(\["next"\]\)/);
    expect(src).toMatch(/Do not allowlist framework packages/);
  });

  it("does not pass backup keys on the gpg argv", () => {
    const dr = readFileSync(path.join(process.cwd(), "scripts/disaster-recovery-smoke.js"), "utf8");
    const offsite = readFileSync(path.join(process.cwd(), "scripts/offsite-restore-exercise.js"), "utf8");
    expect(dr).not.toMatch(/--passphrase "/);
    expect(offsite).not.toMatch(/--passphrase "/);
    expect(dr).toMatch(/gpgWithPassphrase/);
    expect(offsite).toMatch(/gpgWithPassphrase/);
  });
});
