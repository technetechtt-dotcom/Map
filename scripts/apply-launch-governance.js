#!/usr/bin/env node
/**
 * Apply and verify launch governance for main and v* release tags.
 * Usage: node scripts/apply-launch-governance.js [--dry-run]
 */
const { readFileSync } = require("fs");
const { spawnSync } = require("child_process");
const { join } = require("path");

const dryRun = process.argv.includes("--dry-run");
const root = join(__dirname, "..");
const branchConfig = JSON.parse(readFileSync(join(root, "docs", "branch-protection-launch.json"), "utf8"));
const tagConfig = JSON.parse(readFileSync(join(root, "docs", "tag-protection-launch.json"), "utf8"));
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
  const missingContexts = branchProtection.required_status_checks.contexts.filter((name) => !actualContexts.has(name));
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
    console.log("[dry-run] PUT repos/{owner}/{repo}/branches/main/protection");
    console.log(JSON.stringify(branchProtection, null, 2));
    console.log(`[dry-run] ${requireSignatures ? "POST" : "DELETE"} repos/{owner}/{repo}/branches/main/protection/required_signatures`);
    console.log("[dry-run] create or update tag ruleset");
    console.log(JSON.stringify(tagConfig, null, 2));
    return { dryRun: true };
  }

  gh(
    ["api", "repos/{owner}/{repo}/branches/main/protection", "--method", "PUT", "--input", "-"],
    JSON.stringify(branchProtection)
  );
  gh([
    "api",
    "repos/{owner}/{repo}/branches/main/protection/required_signatures",
    "--method",
    requireSignatures ? "POST" : "DELETE",
  ]);

  const rulesets = JSON.parse(
    gh(["api", "repos/{owner}/{repo}/rulesets?includes_parents=false&targets=tag"])
  );
  const existing = rulesets.find((ruleset) => ruleset.name === tagConfig.name && ruleset.source_type === "Repository");
  const rulesetPath = existing
    ? `repos/{owner}/{repo}/rulesets/${existing.id}`
    : "repos/{owner}/{repo}/rulesets";
  const appliedTagRuleset = JSON.parse(
    gh(["api", rulesetPath, "--method", existing ? "PUT" : "POST", "--input", "-"], JSON.stringify(tagConfig))
  );

  const branch = JSON.parse(gh(["api", "repos/{owner}/{repo}/branches/main/protection"]));
  assertBranchProtection(branch);
  const signatures = JSON.parse(
    gh(["api", "repos/{owner}/{repo}/branches/main/protection/required_signatures"])
  );
  if (!signatures.enabled) throw new Error("GitHub did not enable required commit signatures on main");

  const codeowners = JSON.parse(gh(["api", "repos/{owner}/{repo}/codeowners/errors"]));
  if (codeowners.errors?.length) {
    throw new Error(`CODEOWNERS errors: ${JSON.stringify(codeowners.errors)}`);
  }

  const verifiedTagRuleset = JSON.parse(
    gh(["api", `repos/{owner}/{repo}/rulesets/${appliedTagRuleset.id}`])
  );
  const tagRuleTypes = new Set((verifiedTagRuleset.rules || []).map((rule) => rule.type));
  if (verifiedTagRuleset.enforcement !== "active" || !tagRuleTypes.has("required_signatures")) {
    throw new Error("GitHub tag signature ruleset is not active");
  }

  return {
    dryRun: false,
    main: {
      requiredChecks: branchProtection.required_status_checks.contexts,
      approvals: branch.required_pull_request_reviews.required_approving_review_count,
      codeowners: true,
      signedCommits: true,
    },
    tags: { rulesetId: verifiedTagRuleset.id, pattern: "v*", signedCommits: true },
  };
}

try {
  const result = apply();
  console.log(JSON.stringify({ ok: true, branch: "main", ...result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}
