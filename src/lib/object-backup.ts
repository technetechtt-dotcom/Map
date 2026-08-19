import { createHash } from "crypto";
import { prisma } from "./prisma";
import { log } from "./logger";

type S3Sdk = {
  S3Client: new (cfg: unknown) => { send: (command: unknown) => Promise<{ Body?: { transformToByteArray?: () => Promise<Uint8Array> } }> };
  CopyObjectCommand: new (input: unknown) => unknown;
  GetObjectCommand: new (input: unknown) => unknown;
  HeadObjectCommand: new (input: unknown) => unknown;
  PutObjectCommand: new (input: unknown) => unknown;
};

async function s3(): Promise<S3Sdk | null> {
  try {
    return (await import("@aws-sdk/client-s3")) as unknown as S3Sdk;
  } catch {
    return null;
  }
}

function client(sdk: S3Sdk, backup = false) {
  return new sdk.S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: (backup ? process.env.S3_BACKUP_ENDPOINT : process.env.S3_ENDPOINT) || process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  });
}

export async function copyStoredObjectsToBackup() {
  const backupBucket = process.env.S3_BACKUP_BUCKET;
  const sourceBucket = process.env.S3_BUCKET;
  const objects = await prisma.storedObject.findMany({ orderBy: { createdAt: "asc" } });
  if (!backupBucket || !sourceBucket) {
    log.warn("backup.objects.skipped", { reason: "S3_BACKUP_BUCKET or S3_BUCKET missing", count: objects.length });
    return { copied: 0, copiedBytes: 0, verified: 0, skipped: objects.length, manifest: objects.map((row) => ({ id: row.id, sha256: row.sha256, filename: row.filename })) };
  }
  const sdk = await s3();
  if (!sdk) return { copied: 0, copiedBytes: 0, verified: 0, skipped: objects.length, manifest: [] };

  const dest = client(sdk, true);
  let copied = 0;
  let copiedBytes = 0;
  let verified = 0;
  for (const object of objects) {
    const backupKey = `objects/${object.createdAt.toISOString().slice(0, 10)}/${object.filename}`;
    try {
      await dest.send(
        new sdk.CopyObjectCommand({
          Bucket: backupBucket,
          Key: backupKey,
          CopySource: `${sourceBucket}/${object.filename}`,
          ChecksumAlgorithm: "SHA256",
        })
      );
      copied += 1;
      copiedBytes += object.sizeBytes;
      const head = await dest.send(new sdk.HeadObjectCommand({ Bucket: backupBucket, Key: backupKey }));
      const remote = (head as { ChecksumSHA256?: string }).ChecksumSHA256;
      if (!remote || remote === object.sha256 || createHash("sha256").update(object.sha256).digest("base64") === remote) {
        verified += 1;
      }
    } catch (error) {
      log.warn("backup.object.copy_failed", { id: object.id, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { copied, copiedBytes, verified, skipped: objects.length - copied, manifest: objects.map((row) => ({ id: row.id, sha256: row.sha256, filename: row.filename })) };
}

export async function verifyObjectChecksums(manifest: Array<{ filename: string; sha256: string }>) {
  const bucket = process.env.S3_BACKUP_BUCKET || process.env.S3_BUCKET;
  const sdk = await s3();
  if (!bucket || !sdk) return { ok: false, reason: "object storage not configured", missing: manifest.map((row) => row.filename) };
  const dest = client(sdk, Boolean(process.env.S3_BACKUP_BUCKET));
  const missing: string[] = [];
  for (const row of manifest) {
    try {
      await dest.send(new sdk.HeadObjectCommand({ Bucket: bucket, Key: row.filename }));
    } catch {
      missing.push(row.filename);
    }
  }
  return { ok: missing.length === 0, missing };
}
