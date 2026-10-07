import { afterEach, describe, expect, it } from "vitest";
import { buildFromBackupKeys, looksLikeFilePath } from "../scripts/write-rclone-config.js";

const KEYS = [
  "S3_BACKUP_ACCESS_KEY_ID",
  "S3_BACKUP_SECRET_ACCESS_KEY",
  "S3_BACKUP_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BACKUP_REGION",
];

const previous: Record<string, string | undefined> = {};

function stash() {
  for (const key of KEYS) previous[key] = process.env[key];
}

function restore() {
  for (const key of KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

describe("write-rclone-config", () => {
  afterEach(restore);

  it("treats rclone.conf paths as files, not INI bodies", () => {
    expect(looksLikeFilePath("/home/runner/.config/rclone/rclone.conf")).toBe(true);
    expect(looksLikeFilePath("[offsite]\ntype = s3")).toBe(false);
  });

  it("builds an offsite remote from independent backup keys", () => {
    stash();
    process.env.S3_BACKUP_ACCESS_KEY_ID = "AKIATESTBACKUP";
    process.env.S3_BACKUP_SECRET_ACCESS_KEY = "backup-secret";
    process.env.S3_BACKUP_BUCKET = "ict-offsite";
    process.env.S3_ACCESS_KEY_ID = "AKIAPRIMARY";
    process.env.S3_SECRET_ACCESS_KEY = "primary-secret";
    process.env.S3_BACKUP_REGION = "eu-west-1";
    const built = buildFromBackupKeys();
    expect(built?.destination).toBe("offsite:ict-offsite");
    expect(built?.conf).toContain("access_key_id = AKIATESTBACKUP");
    expect(built?.conf).toContain("region = eu-west-1");
    expect(built?.conf).not.toContain("AKIAPRIMARY");
  });
});
