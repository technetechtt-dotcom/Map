#!/usr/bin/env node
/** Verify that a v* release ref is an annotated, GitHub-verified signed tag. */
const repository = process.env.GITHUB_REPOSITORY || "";
const tagName = process.env.GITHUB_REF_NAME || "";
const token = process.env.GITHUB_TOKEN || "";

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitHub ${path} returned ${response.status}`);
  return response.json();
}

async function main() {
  if (!repository || !tagName || !token) throw new Error("GITHUB_REPOSITORY, GITHUB_REF_NAME, and GITHUB_TOKEN are required");
  if (!/^v\d/.test(tagName)) throw new Error(`release tag must start with a version: ${tagName}`);

  const ref = await github(`/git/ref/tags/${encodeURIComponent(tagName)}`);
  if (ref.object?.type !== "tag") {
    throw new Error("release tags must be annotated and cryptographically signed; lightweight tags are rejected");
  }
  const tag = await github(`/git/tags/${ref.object.sha}`);
  if (tag.object?.type !== "commit") throw new Error("release tag must point directly to a commit");
  if (tag.verification?.verified !== true) {
    throw new Error(`release tag signature is not verified (${tag.verification?.reason || "unknown"})`);
  }
  console.log(JSON.stringify({ ok: true, tag: tagName, verified: true, reason: tag.verification.reason }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
