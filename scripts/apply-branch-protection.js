#!/usr/bin/env node
/**
 * Apply PR + CODEOWNERS protection from docs/branch-protection.json (no required signatures).
 * Usage: node scripts/apply-branch-protection.js [--dry-run]
 */
const { readFileSync } = require("fs");
const { spawnSync } = require("child_process");
const { join } = require("path");

const dryRun = process.argv.includes("--dry-run");
const root = join(__dirname, "..");
const branchConfig = JSON.parse(readFileSync(join(root, "docs", "branch-protection.json"), "utf8"));
const { required_signatures: requireSignatures, ...branchProtection } = branchConfig;

function gh(args, input) {
  const result = spawnSync("gh", args, {
    input,
    encoding: "utf8",
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `gh exited ${result.status}`).trim());
  }
  return result.stdout || "";
}

function assertBranchProtection(actual) {
  const actualContexts = new Set(actual.required_status_checks?.contexts || []);
  const missingContexts = (branchProtection.required_status_checks?.contexts || []).filter(
    (name) => !actualContexts.has(name)
  );
  if (missingContexts.length) throw new Error(`GitHub omitted required checks: ${missingContexts.join(", ")}`);
  if (!actual.required_pull_request_reviews?.require_code_owner_reviews) {
    throw new Error("GitHub did not enable required CODEOWNERS review");
  }
  if ((actual.required_pull_request_reviews?.required_approving_review_count || 0) < 1) {
    throw new Error("GitHub did not require a PR approval");
  }
  if (!actual.enforce_admins?.enabled) throw new Error("GitHub did not enforce protection for administrators");
  if (actual.allow_force_pushes?.enabled) throw new Error("GitHub still allows force pushes to main");
  if (actual.allow_deletions?.enabled) throw new Error("GitHub still allows deletion of main");
}

function apply() {
  if (dryRun) {
    console.log("[dry-run] PUT repos/technetechtt-dotcom/Map/branches/main/protection");
    console.log(JSON.stringify(branchProtection, null, 2));
    return { dryRun: true };
  }

  gh(
    ["api", "repos/technetechtt-dotcom/Map/branches/main/protection", "--method", "PUT", "--input", "-"],
    JSON.stringify(branchProtection)
  );
  try {
    gh([
      "api",
      "repos/technetechtt-dotcom/Map/branches/main/protection/required_signatures",
      "--method",
      requireSignatures ? "POST" : "DELETE",
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (requireSignatures || !/404|Not Found/i.test(message)) throw error;
  }

  const branch = JSON.parse(gh(["api", "repos/technetechtt-dotcom/Map/branches/main/protection"]));
  assertBranchProtection(branch);
  const codeowners = JSON.parse(gh(["api", "repos/technetechtt-dotcom/Map/codeowners/errors"]));
  if (codeowners.errors?.length) {
    throw new Error(`CODEOWNERS errors: ${JSON.stringify(codeowners.errors)}`);
  }

  return {
    dryRun: false,
    main: {
      requiredChecks: branchProtection.required_status_checks.contexts,
      approvals: branch.required_pull_request_reviews.required_approving_review_count,
      codeowners: true,
      signedCommits: Boolean(requireSignatures),
    },
  };
}

try {
  const result = apply();
  console.log(JSON.stringify({ ok: true, branch: "main", ...result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}
