import { describe, expect, it } from "vitest";
import { validateEnv } from "@/lib/env";
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
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      ENFORCE_ENV_VALIDATION: process.env.ENFORCE_ENV_VALIDATION,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY,
      CAPTCHA_DISABLED: process.env.CAPTCHA_DISABLED,
    };
    process.env.NODE_ENV = "production";
    process.env.ENFORCE_ENV_VALIDATION = "1";
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.BACKUP_ENCRYPTION_KEY;
    process.env.CAPTCHA_DISABLED = "1";
    const issues = validateEnv();
    // restore
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    expect(issues.some((i) => i.key === "NEXTAUTH_SECRET")).toBe(true);
  });
});
