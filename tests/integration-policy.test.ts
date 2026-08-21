import { describe, expect, it } from "vitest";
import { productionBootGaps, validateEnv } from "@/lib/env";
import {
  assertLocationAccess,
  assertLocationAssignmentChange,
  PUBLIC_LOCATION_STATUSES,
  SUBMISSION_STATUSES,
} from "@/lib/policy";
import { locationCreateSchema, submissionSchema } from "@/lib/validation";

describe("public exposure policy constants", () => {
  it("does not include draft statuses in public set", () => {
    expect(PUBLIC_LOCATION_STATUSES).toEqual(["PUBLISHED", "VERIFIED"]);
  });

  it("defines strict submission enum", () => {
    expect(SUBMISSION_STATUSES).toContain("APPROVED");
    expect(SUBMISSION_STATUSES).toContain("REJECTED");
  });
});

describe("structured submission validation", () => {
  it("rejects loose payloads missing required location fields", () => {
    const bad = submissionSchema.safeParse({
      submitterName: "A",
      submitterEmail: "a@b.co",
      payload: { foo: 1 },
    });
    expect(bad.success).toBe(false);
  });

  it("accepts structured location submission", () => {
    const ok = submissionSchema.safeParse({
      submitterName: "Ada Lovelace",
      submitterEmail: "ada@example.com",
      payload: {
        name: "Upington Hub",
        summary: "A knowledge site",
        latitude: -28.4,
        longitude: 21.2,
        provinceSlug: "northern-cape",
      },
    });
    expect(ok.success).toBe(true);
  });
});

describe("location create schema gate", () => {
  it("requires name summary coords", () => {
    expect(
      locationCreateSchema.safeParse({
        name: "Upington",
        summary: "A site",
        latitude: -28,
        longitude: 21,
      }).success
    ).toBe(true);
    expect(locationCreateSchema.safeParse({ name: "Upington" }).success).toBe(false);
  });
});

describe("org claim prevention", () => {
  const orgAdmin = {
    id: "oa",
    role: "ORG_ADMIN",
    provinceId: "p1",
    organisationId: "o1",
  };
  it("cannot claim null organisation records", () => {
    const r = assertLocationAssignmentChange(
      orgAdmin,
      { provinceId: "p1", organisationId: null, ownerId: null },
      "o1",
      "p1"
    );
    expect(r.ok).toBe(false);
  });
  it("cannot write unassigned location", () => {
    expect(
      assertLocationAccess(orgAdmin, {
        provinceId: "p1",
        organisationId: null,
        ownerId: null,
      }).ok
    ).toBe(false);
  });
});

describe("env validation", () => {
  it("reports missing secrets when enforced", () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = {
      NODE_ENV: env.NODE_ENV,
      ENFORCE_ENV_VALIDATION: env.ENFORCE_ENV_VALIDATION,
      NEXTAUTH_SECRET: env.NEXTAUTH_SECRET,
      DATABASE_URL: env.DATABASE_URL,
      BACKUP_ENCRYPTION_KEY: env.BACKUP_ENCRYPTION_KEY,
      CAPTCHA_DISABLED: env.CAPTCHA_DISABLED,
    };
    env.NODE_ENV = "production";
    env.ENFORCE_ENV_VALIDATION = "1";
    delete env.NEXTAUTH_SECRET;
    delete env.DATABASE_URL;
    delete env.BACKUP_ENCRYPTION_KEY;
    env.CAPTCHA_DISABLED = "1";
    const issues = validateEnv();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    expect(issues.some((i) => i.key === "NEXTAUTH_SECRET")).toBe(true);
  });

  it("does not block CI/e2e boot even when production secrets are missing", () => {
    expect(productionBootGaps({ NODE_ENV: "production", CI: "true" })).toEqual([]);
    expect(productionBootGaps({ NODE_ENV: "production", E2E: "1" })).toEqual([]);
  });

  it("lists production boot gaps when not in CI", () => {
    const gaps = productionBootGaps({ NODE_ENV: "production", CI: "0" });
    expect(gaps).toContain("NEXTAUTH_SECRET");
    expect(gaps).toContain("CRON_SECRET");
    expect(gaps).toContain("STORAGE_DRIVER=s3");
  });
});
