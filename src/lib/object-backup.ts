import { createHash } from "crypto";
import { prisma } from "./prisma";
import { log } from "./logger";

type S3Sdk = {
  S3Client: new (cfg: unknown) => {
    send: (command: unknown) => Promise<{
      Body?: { transformToByteArray?: () => Promise<Uint8Array> };
      ChecksumSHA256?: string;
    }>;
  };
  CopyObjectCommand: new (input: unknown) => unknown;
  GetObjectCommand: new (input: unknown) => unknown;
  HeadObjectCommand: new (input: unknown) => unknown;
  PutObjectCommand: new (input: unknown) => unknown;
};

export type ObjectBackupManifestRow = {
  id: string;
  sha256: string | null;
  filename: string;
  backupKey: string;
  sizeBytes: number;
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

export function backupObjectKey(filename: string, createdAt: Date) {
  return `objects/${createdAt.toISOString().slice(0, 10)}/${filename}`;
}

async function sha256Body(body: { transformToByteArray?: () => Promise<Uint8Array> } | undefined) {
  if (!body?.transformToByteArray) return null;
  const bytes = await body.transformToByteArray();
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export async function copyStoredObjectsToBackup() {
  const backupBucket = process.env.S3_BACKUP_BUCKET;
  const sourceBucket = process.env.S3_BUCKET;
  const objects = await prisma.storedObject.findMany({ orderBy: { createdAt: "asc" } });
  const manifest: ObjectBackupManifestRow[] = objects.map((row) => ({
    id: row.id,
    sha256: row.sha256,
    filename: row.filename,
    backupKey: backupObjectKey(row.filename, row.createdAt),
    sizeBytes: row.sizeBytes,
  }));
  const production = process.env.NODE_ENV === "production" && process.env.E2E !== "1";
  if (!backupBucket || !sourceBucket) {
    if (production) throw new Error("S3_BACKUP_BUCKET and S3_BUCKET are required for object backup");
    log.warn("backup.objects.skipped", { reason: "S3_BACKUP_BUCKET or S3_BUCKET missing", count: objects.length });
    return { copied: 0, copiedBytes: 0, verified: 0, skipped: objects.length, failed: [] as string[], manifest };
  }
  const sdk = await s3();
  if (!sdk) {
    if (production) throw new Error("S3 SDK is required for object backup");
    return { copied: 0, copiedBytes: 0, verified: 0, skipped: objects.length, failed: [] as string[], manifest };
  }

  const dest = client(sdk, true);
  let copied = 0;
  let copiedBytes = 0;
  let verified = 0;
  const failed: string[] = [];
  for (const object of objects) {
    const backupKey = backupObjectKey(object.filename, object.createdAt);
    try {
      await dest.send(
        new sdk.CopyObjectCommand({
          Bucket: backupBucket,
          Key: backupKey,
          CopySource: `${sourceBucket}/${object.filename}`,
        })
      );
      copied += 1;
      copiedBytes += object.sizeBytes;
      const got = await dest.send(new sdk.GetObjectCommand({ Bucket: backupBucket, Key: backupKey }));
      const hash = await sha256Body(got.Body);
      if (object.sha256 && hash && hash !== object.sha256) {
        log.warn("backup.object.checksum_mismatch", { id: object.id, expected: object.sha256, actual: hash });
        failed.push(object.filename);
        continue;
      }
      if (hash || !object.sha256) verified += 1;
    } catch (error) {
      failed.push(object.filename);
      log.warn("backup.object.copy_failed", { id: object.id, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  if (failed.length) {
    log.error("backup.objects.incomplete", { failed: failed.length, copied, verified });
  }
  return { copied, copiedBytes, verified, skipped: objects.length - copied, failed, manifest };
}

export async function verifyObjectChecksums(manifest: Array<{ filename: string; sha256?: string | null; backupKey?: string }>) {
  const bucket = process.env.S3_BACKUP_BUCKET || process.env.S3_BUCKET;
  const sdk = await s3();
  if (!bucket || !sdk) return { ok: false, reason: "object storage not configured", missing: manifest.map((row) => row.filename), mismatched: [] as string[] };
  const dest = client(sdk, Boolean(process.env.S3_BACKUP_BUCKET));
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const row of manifest) {
    const key = row.backupKey || row.filename;
    try {
      const got = await dest.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
      const hash = await sha256Body(got.Body);
      if (row.sha256 && hash && hash !== row.sha256) mismatched.push(key);
    } catch {
      missing.push(key);
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}
