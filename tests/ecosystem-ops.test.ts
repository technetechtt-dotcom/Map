import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import path from "path";
import { slugFromTitle, isEcosystemType } from "@/lib/ecosystem";

describe("ops preflight", () => {
  it("fails closed when backup secrets are missing", () => {
    const script = path.join(process.cwd(), "scripts/ops-preflight.js");
    const result = spawnSync(process.execPath, [script, "backup"], {
      encoding: "utf8",
      env: { ...process.env, PRODUCTION_DIRECT_URL: "", BACKUP_ENCRYPTION_KEY: "", BACKUP_DESTINATION: "" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/PRODUCTION_DIRECT_URL/);
  });

  it("fails closed when deploy has no target", () => {
    const script = path.join(process.cwd(), "scripts/ops-preflight.js");
    const result = spawnSync(process.execPath, [script, "deploy"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION_APP_URL: "https://example.test",
        VERCEL_TOKEN: "",
        VERCEL_ORG_ID: "",
        VERCEL_PROJECT_ID: "",
        PRODUCTION_DEPLOY_HOOK: "",
        METRICS_TOKEN: "",
        CRON_SECRET: "",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/PRODUCTION_DEPLOY_HOOK|VERCEL_TOKEN/);
  });
});

describe("ecosystem helpers", () => {
  it("accepts the four admin lifecycle types", () => {
    expect(isEcosystemType("funding")).toBe(true);
    expect(isEcosystemType("location")).toBe(false);
    expect(slugFromTitle("NYDA Grant Programme")).toBe("nyda-grant-programme");
  });
});
