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

type StorageSide = "source" | "backup";

async function s3(): Promise<S3Sdk | null> {
  try {
    return (await import("@aws-sdk/client-s3")) as unknown as S3Sdk;
  } catch {
    return null;
  }
}

function productionObjectBackup(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  return env.NODE_ENV === "production" && env.E2E !== "1";
}

export function objectBackupCredentials(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const source = {
    accessKeyId: env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || "",
  };
  const backup = {
    accessKeyId: env.S3_BACKUP_ACCESS_KEY_ID || "",
    secretAccessKey: env.S3_BACKUP_SECRET_ACCESS_KEY || "",
  };
  if (backup.accessKeyId && backup.secretAccessKey) return { source, backup, independent: true as const };
  if (productionObjectBackup(env)) return null;
  if (source.accessKeyId && source.secretAccessKey) return { source, backup: source, independent: false as const };
  return null;
}

export function objectBackupConfigured(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  return Boolean(env.S3_BUCKET && env.S3_BACKUP_BUCKET && objectBackupCredentials(env));
}

function client(sdk: S3Sdk, side: StorageSide, env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const creds = objectBackupCredentials(env);
  if (!creds) throw new Error("Object backup credentials are not configured");
  const backup = side === "backup";
  const endpoint = backup
    ? env.S3_BACKUP_ENDPOINT || undefined
    : env.S3_ENDPOINT || undefined;
  return new sdk.S3Client({
    region: (backup ? env.S3_BACKUP_REGION : env.S3_REGION) || env.S3_REGION || "auto",
    endpoint,
    credentials: backup ? creds.backup : creds.source,
    forcePathStyle: Boolean(endpoint),
  });
}

const OBJECT_BACKUP_CURSOR_KEY = "objectBackup.cursor";

type ObjectBackupCursor = { lastFullAt: string | null; keys: string[] };

async function readObjectBackupCursor(): Promise<ObjectBackupCursor> {
  const row = await prisma.appSetting.findUnique({ where: { key: OBJECT_BACKUP_CURSOR_KEY } });
  if (!row?.value) return { lastFullAt: null, keys: [] };
  try {
    const parsed = JSON.parse(row.value) as ObjectBackupCursor;
    return { lastFullAt: parsed.lastFullAt || null, keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
  } catch {
    return { lastFullAt: null, keys: [] };
  }
}

async function writeObjectBackupCursor(cursor: ObjectBackupCursor) {
  const value = JSON.stringify(cursor);
  await prisma.appSetting.upsert({
    where: { key: OBJECT_BACKUP_CURSOR_KEY },
    create: { key: OBJECT_BACKUP_CURSOR_KEY, value },
    update: { value },
  });
}

function sidecarKey(backupKey: string) {
  return `${backupKey}.sha256`;
}

async function sha256Body(body: { transformToByteArray?: () => Promise<Uint8Array> } | undefined) {
  if (!body?.transformToByteArray) return null;
  const bytes = await body.transformToByteArray();
  return { hash: createHash("sha256").update(Buffer.from(bytes)).digest("hex"), bytes: Buffer.from(bytes) };
}

export function manifestChecksum(manifest: ObjectBackupManifestRow[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...manifest]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((row) => ({ id: row.id, sha256: row.sha256, backupKey: row.backupKey, sizeBytes: row.sizeBytes }))
      )
    )
    .digest("hex");
}

export function backupObjectKey(filename: string, createdAt: Date) {
  return `objects/${createdAt.toISOString().slice(0, 10)}/${filename}`;
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
  const production = productionObjectBackup();
  if (!backupBucket || !sourceBucket || !objectBackupCredentials()) {
    if (production) throw new Error("Independent object-backup source and destination credentials are required");
    log.warn("backup.objects.skipped", { reason: "object backup not configured", count: objects.length });
    return {
      copied: 0,
      copiedBytes: 0,
      verified: 0,
      skipped: objects.length,
      failed: [] as string[],
      manifest,
      checksumSha256: manifestChecksum(manifest),
      mode: "skipped" as const,
    };
  }
  const sdk = await s3();
  if (!sdk) {
    if (production) throw new Error("S3 SDK is required for object backup");
    return {
      copied: 0,
      copiedBytes: 0,
      verified: 0,
      skipped: objects.length,
      failed: [] as string[],
      manifest,
      checksumSha256: manifestChecksum(manifest),
      mode: "skipped" as const,
    };
  }

  const source = client(sdk, "source");
  const dest = client(sdk, "backup");
  const cursor = await readObjectBackupCursor();
  const lastFullAt = cursor.lastFullAt ? new Date(cursor.lastFullAt) : null;
  const full =
    process.env.OBJECT_BACKUP_FULL === "1" ||
    !lastFullAt ||
    Date.now() - lastFullAt.getTime() > 7 * 24 * 3600_000;
  let copied = 0;
  let copiedBytes = 0;
  let verified = 0;
  const failed: string[] = [];
  const keys = new Set(cursor.keys);
  for (const object of objects) {
    const backupKey = backupObjectKey(object.filename, object.createdAt);
    try {
      if (!full) {
        try {
          await dest.send(new sdk.HeadObjectCommand({ Bucket: backupBucket, Key: backupKey }));
          await dest.send(new sdk.HeadObjectCommand({ Bucket: backupBucket, Key: sidecarKey(backupKey) }));
          verified += 1;
          keys.add(backupKey);
          continue;
        } catch {
          // Missing destination object or sidecar — copy below.
        }
      }
      const got = await source.send(new sdk.GetObjectCommand({ Bucket: sourceBucket, Key: object.filename }));
      const body = await sha256Body(got.Body);
      if (!body) throw new Error("empty object body");
      if (object.sha256 && body.hash !== object.sha256) {
        log.warn("backup.object.source_checksum_mismatch", { id: object.id, expected: object.sha256, actual: body.hash });
        failed.push(object.filename);
        continue;
      }
      await dest.send(
        new sdk.PutObjectCommand({
          Bucket: backupBucket,
          Key: backupKey,
          Body: body.bytes,
          ContentType: object.contentType || "application/octet-stream",
        })
      );
      await dest.send(
        new sdk.PutObjectCommand({
          Bucket: backupBucket,
          Key: sidecarKey(backupKey),
          Body: `${body.hash}  ${backupKey}\n`,
          ContentType: "text/plain",
        })
      );
      const check = await dest.send(new sdk.GetObjectCommand({ Bucket: backupBucket, Key: backupKey }));
      const destBody = await sha256Body(check.Body);
      if (!destBody || destBody.hash !== body.hash) {
        log.warn("backup.object.dest_checksum_mismatch", { id: object.id, expected: body.hash, actual: destBody?.hash || null });
        failed.push(object.filename);
        continue;
      }
      copied += 1;
      copiedBytes += object.sizeBytes;
      verified += 1;
      keys.add(backupKey);
    } catch (error) {
      failed.push(object.filename);
      log.warn("backup.object.copy_failed", { id: object.id, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  if (failed.length) {
    log.error("backup.objects.incomplete", { failed: failed.length, copied, verified, mode: full ? "full" : "incremental" });
  }
  const mode = full ? "full" : "incremental";
  await writeObjectBackupCursor({
    lastFullAt: full && failed.length === 0 ? new Date().toISOString() : cursor.lastFullAt,
    keys: [...keys],
  });
  await prisma.backupRecord.create({
    data: {
      filename: "object-storage-manifest.json",
      path: "object-backup-cursor",
      sizeBytes: copiedBytes,
      kind: "objects",
      notes: `mode=${mode}`,
      checksumSha256: manifestChecksum(manifest),
      objectsCopied: copied,
      lastVerifiedAt: new Date(),
    },
  });
  return {
    copied,
    copiedBytes,
    verified,
    skipped: objects.length - copied,
    failed,
    manifest,
    checksumSha256: manifestChecksum(manifest),
    mode,
  };
}

export async function verifyObjectChecksums(manifest: Array<{ filename: string; sha256?: string | null; backupKey?: string }>) {
  const bucket = process.env.S3_BACKUP_BUCKET;
  const sdk = await s3();
  if (!bucket || !sdk || !objectBackupCredentials()) {
    return { ok: false, reason: "object storage not configured", missing: manifest.map((row) => row.filename), mismatched: [] as string[] };
  }
  const dest = client(sdk, "backup");
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const row of manifest) {
    const key = row.backupKey || row.filename;
    try {
      const sidecar = await dest.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: sidecarKey(key) }));
      const sidecarBody = await sha256Body(sidecar.Body);
      const sidecarHash = sidecarBody?.bytes ? Buffer.from(sidecarBody.bytes).toString("utf8").trim().split(/\s+/)[0] : "";
      if (!sidecarHash) {
        missing.push(sidecarKey(key));
        continue;
      }
      const got = await dest.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await sha256Body(got.Body);
      if (!body) {
        missing.push(key);
        continue;
      }
      if (sidecarHash !== body.hash) mismatched.push(key);
      if (row.sha256 && body.hash !== row.sha256) mismatched.push(key);
    } catch {
      missing.push(key);
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}
