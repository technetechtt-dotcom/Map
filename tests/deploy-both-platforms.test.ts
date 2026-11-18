import { describe, expect, it } from "vitest";

// CommonJS script exports the pure configuration builder without triggering deployments.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { deploymentEnv } = require("../scripts/deploy-both-platforms.js") as {
  deploymentEnv: (platform: string, env: Record<string, string>) => Record<string, string>;
};

const base = {
  PRODUCTION_APP_URL: "https://public.example.test",
  OPS_APP_URL: "https://ops.example.test",
  PRODUCTION_DEPLOY_HOOK: "https://api.render.com/deploy/public",
  OPS_DEPLOY_HOOK: "https://api.render.com/deploy/ops",
};

describe("production dual-platform isolation", () => {
  it("never skips the ops origin when missing", () => {
    expect(() => deploymentEnv("ops", { ...base, OPS_APP_URL: "" })).toThrow(/Missing OPS_APP_URL/);
  });
  it("selects a distinct ops hook and URL", () => {
    const ops = deploymentEnv("ops", base);
    expect(ops.PRODUCTION_APP_URL).toBe(base.OPS_APP_URL);
    expect(ops.PRODUCTION_DEPLOY_HOOK).toBe(base.OPS_DEPLOY_HOOK);
    expect(ops.APP_PLATFORM).toBe("ops");
  });
  it("does not inherit public Vercel project for ops", () => {
    expect(() => deploymentEnv("ops", {
      PRODUCTION_APP_URL: base.PRODUCTION_APP_URL,
      OPS_APP_URL: base.OPS_APP_URL,
      VERCEL_TOKEN: "token",
      VERCEL_ORG_ID: "team",
      VERCEL_PROJECT_ID: "public-project",
    })).toThrow(/VERCEL_OPS_PROJECT_ID/);
  });
  it("uses the matching Vercel project IDs", () => {
    const environment = {
      ...base, VERCEL_TOKEN: "token", VERCEL_ORG_ID: "team",
      VERCEL_PROJECT_ID: "public-project", VERCEL_OPS_PROJECT_ID: "ops-project",
    };
    expect(deploymentEnv("public", environment).VERCEL_PROJECT_ID).toBe("public-project");
    expect(deploymentEnv("ops", environment).VERCEL_PROJECT_ID).toBe("ops-project");
  });
  it("fails closed when no target is configured", () => {
    expect(() => deploymentEnv("public", {
      PRODUCTION_APP_URL: base.PRODUCTION_APP_URL,
    })).toThrow(/No deployment target/);
  });
});
