#!/usr/bin/env node
/**
 * Fail closed unless the given SHA (default: origin/main HEAD) has green CI and Security.
 * Used as a production deploy gate when direct pushes to main remain allowed.
 */
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const repo = process.env.GITHUB_REPOSITORY || "";
const requestedSha = process.argv.slice(2).find((arg) => arg !== "--wait") || process.env.GITHUB_SHA || "";

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": "sa-ict-map-deploy-gate",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const wait = process.argv.includes("--wait");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runForSha(workflowFile, sha) {
  const deadline = Date.now() + (wait ? 10 * 60_000 : 0);
  while (true) {
    const data = await gh(`/repos/${repo}/actions/workflows/${workflowFile}/runs?branch=main&per_page=20`);
    const match = (data.workflow_runs || []).find((run) => run.head_sha === sha);
    if (match?.status === "completed") return match;
    if (!wait || Date.now() >= deadline) return match || null;
    await sleep(20000);
  }
}

async function main() {
  if (!repo) {
    console.error("GITHUB_REPOSITORY is required");
    process.exit(1);
  }
  const sha = requestedSha || (await gh(`/repos/${repo}/commits/main`)).sha;
  const [ciRun, securityRun] = await Promise.all([runForSha("ci.yml", sha), runForSha("security.yml", sha)]);
  const report = {
    sha,
    ci: ciRun ? { conclusion: ciRun.conclusion, html: ciRun.html_url } : null,
    security: securityRun ? { conclusion: securityRun.conclusion, html: securityRun.html_url } : null,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!ciRun || ciRun.conclusion !== "success") {
    console.error("CI is not green for this commit — production deploy blocked");
    process.exit(1);
  }
  if (!securityRun || securityRun.conclusion !== "success") {
    console.error("Security is not green for this commit — production deploy blocked");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
