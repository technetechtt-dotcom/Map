import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { ignoredBuildDecision } = require("../scripts/vercel-ignored-build.js") as {
  ignoredBuildDecision: (env?: Record<string, string | undefined>) => { action: string; reason: string };
};

describe("Vercel ignored-build fail-closed gate", () => {
  it("skips non-main branches", () => {
    expect(ignoredBuildDecision({ VERCEL_GIT_COMMIT_REF: "feat/x" })).toMatchObject({ action: "skip" });
  });

  it("skips production builds when GitHub token is missing", () => {
    expect(ignoredBuildDecision({ VERCEL_GIT_COMMIT_REF: "main" })).toEqual({
      action: "skip",
      reason: "missing GitHub token — fail closed",
    });
  });

  it("certifies main when a GitHub token is present", () => {
    expect(ignoredBuildDecision({ VERCEL_GIT_COMMIT_REF: "main", GITHUB_TOKEN: "ghs_test" })).toMatchObject({
      action: "certify",
    });
  });
});
