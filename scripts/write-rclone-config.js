#!/usr/bin/env node
/**
 * Build rclone.conf from independent S3 backup credentials.
 * Prefer S3_BACKUP_* over a stale RCLONE_CONFIG blob (which previously stored InvalidAccessKeyId).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

function env(name) {
  return (process.env[name] || "").trim();
}

function looksLikeFilePath(value) {
  return (
    /rclone\.conf$/i.test(value) ||
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(value)
  );
}

function buildFromBackupKeys() {
  const accessKey = env("S3_BACKUP_ACCESS_KEY_ID");
  const secret = env("S3_BACKUP_SECRET_ACCESS_KEY");
  const bucket = env("S3_BACKUP_BUCKET");
  if (!accessKey || !secret || !bucket) return null;
  if (accessKey === env("S3_ACCESS_KEY_ID") || secret === env("S3_SECRET_ACCESS_KEY")) {
    console.error("S3 backup credentials must be independent of the primary object-store keys");
    process.exit(1);
  }
  const region = env("S3_BACKUP_REGION") || env("S3_REGION") || "us-east-1";
  const endpoint = env("S3_BACKUP_ENDPOINT");
  const lines = [
    "[offsite]",
    "type = s3",
    `provider = ${endpoint ? "Other" : "AWS"}`,
    "env_auth = false",
    `access_key_id = ${accessKey}`,
    `secret_access_key = ${secret}`,
    `region = ${region}`,
    "acl = private",
    "no_check_bucket = true",
  ];
  if (endpoint) {
    lines.push(`endpoint = ${endpoint}`);
    lines.push("force_path_style = true");
  }
  return { conf: `${lines.join("\n")}\n`, destination: `offsite:${bucket}`, region, endpoint, accessKey, secret, bucket };
}

async function probe(built) {
  if (process.env.SKIP_S3_PROBE === "1") return;
  const { S3Client, HeadBucketCommand, CreateBucketCommand } = require("@aws-sdk/client-s3");
  const client = new S3Client({
    region: built.region,
    endpoint: built.endpoint || undefined,
    forcePathStyle: Boolean(built.endpoint),
    credentials: { accessKeyId: built.accessKey, secretAccessKey: built.secret },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: built.bucket }));
  } catch (error) {
    const name = error?.name || "";
    const code = error?.Code || error?.code || "";
    const message = error instanceof Error ? error.message : String(error);
    const http = error?.$metadata?.httpStatusCode;
    const blob = `${name} ${code} ${message} ${http || ""}`;
    if (/NotFound|NoSuchBucket|404/i.test(blob)) {
      await client.send(new CreateBucketCommand({ Bucket: built.bucket }));
      return;
    }
    console.error(
      JSON.stringify({
        ok: false,
        error: "S3 backup credentials failed HeadBucket",
        name: name || "Unknown",
        code: code || "Unknown",
        http: http || null,
        message: message.slice(0, 240),
        hint: "Replace S3_BACKUP_ACCESS_KEY_ID / S3_BACKUP_SECRET_ACCESS_KEY with a live IAM user that can PutObject on S3_BACKUP_BUCKET. If the keys are for R2/MinIO, set S3_BACKUP_ENDPOINT too.",
      })
    );
    process.exit(1);
  }
}

async function main() {
  const destDir = path.join(os.homedir(), ".config", "rclone");
  fs.mkdirSync(destDir, { recursive: true });
  const confPath = path.join(destDir, "rclone.conf");

  const built = buildFromBackupKeys();
  const rcloneEnv = env("RCLONE_CONFIG");
  let conf;
  let destination = env("BACKUP_DESTINATION");
  let source = "rclone-config-secret";

  if (built) {
    conf = built.conf;
    source = "s3-backup-keys";
    destination = built.destination;
    await probe(built);
  } else if (rcloneEnv && !looksLikeFilePath(rcloneEnv) && rcloneEnv.includes("[")) {
    conf = rcloneEnv.endsWith("\n") ? rcloneEnv : `${rcloneEnv}\n`;
  } else {
    console.error(
      "Cannot write rclone config. Set S3_BACKUP_ACCESS_KEY_ID, S3_BACKUP_SECRET_ACCESS_KEY, and S3_BACKUP_BUCKET."
    );
    process.exit(1);
  }

  fs.writeFileSync(confPath, conf, { encoding: "utf8", mode: 0o600 });
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `RCLONE_CONFIG=${confPath}\nBACKUP_DESTINATION=${destination}\n`);
  }
  console.log(JSON.stringify({ ok: true, configPath: confPath, destination, source }));
}

module.exports = { buildFromBackupKeys, looksLikeFilePath };

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
