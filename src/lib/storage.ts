/**
 * Secure upload validation + object storage (S3-compatible).
 * STORAGE_DRIVER=local | s3
 * When STORAGE_DRIVER=s3, local fallback is forbidden unless STORAGE_ALLOW_LOCAL_FALLBACK=1.
 */

import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { MAX_UPLOAD_BYTES } from "@/lib/security";
import { prisma } from "@/lib/prisma";

const ALLOWED: Record<string, string[]> = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".pdf": ["application/pdf"],
};

export function sniffMimeForTest(buf: Buffer): string | null {
  return sniffMime(buf);
}

function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF87a") return "image/gif";
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export type StoredFile = {
  url: string;
  filename: string;
  size: number;
  contentType: string;
  sha256: string;
  access: string;
  id?: string;
};

export async function validateAndStoreUpload(
  file: File,
  opts?: { organisationId?: string | null; uploadedById?: string | null; access?: "private" | "public" }
): Promise<{ ok: true; file: StoredFile } | { ok: false; error: string }> {
  let bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return { ok: false, error: "Empty file" };
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Max file size ${MAX_UPLOAD_BYTES} bytes` };
  }

  const ext = path.extname(file.name || "").toLowerCase();
  if (!ext || !ALLOWED[ext]) return { ok: false, error: "Unsupported file type" };

  const sniffed = sniffMime(bytes);
  if (!sniffed || !ALLOWED[ext].includes(sniffed)) {
    return { ok: false, error: "File content does not match extension" };
  }

  if (sniffed === "application/pdf") {
    if (bytes.includes(Buffer.from("<script", "utf8")) || bytes.includes(Buffer.from("/JS", "utf8"))) {
      return { ok: false, error: "Rejected dangerous PDF content" };
    }
  }

  const { scanUploadBuffer } = await import("./av-scan");
  const scan = await scanUploadBuffer(bytes, {
    filename: file.name || "upload",
    contentType: sniffed,
  });
  if (!scan.ok) return { ok: false, error: scan.reason };

  // Re-encode images via sharp when available to strip metadata
  if (sniffed.startsWith("image/") && sniffed !== "image/gif") {
    try {
      const sharp = (await import("sharp")).default;
      if (sniffed === "image/png") {
        bytes = await sharp(bytes).rotate().png().toBuffer();
      } else if (sniffed === "image/webp") {
        bytes = await sharp(bytes).rotate().webp().toBuffer();
      } else {
        bytes = await sharp(bytes).rotate().jpeg({ quality: 88 }).toBuffer();
      }
    } catch {
      // sharp optional failure — keep original after magic-byte check
    }
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = `${randomUUID()}${ext === ".jpeg" ? ".jpg" : ext}`;
  const driver = process.env.STORAGE_DRIVER || "local";
  const access = opts?.access || "private";

  let url: string;
  let storedDriver = driver;
  if (driver === "s3") {
    const s3url = await putS3(filename, bytes, sniffed, access);
    if (!s3url) return { ok: false, error: "Object storage upload failed" };
    url = s3url.url;
    storedDriver = s3url.driver;
  } else {
    // Private local objects must never live under `public/`, where Next's
    // static file handler would bypass authorization. Public objects can use
    // the static path; private objects are streamed through the object route.
    const uploadRoot =
      access === "public"
        ? path.join(process.cwd(), "public", "uploads")
        : path.join(process.cwd(), "data", "uploads-private");
    await mkdir(uploadRoot, { recursive: true });
    await writeFile(path.join(uploadRoot, filename), bytes);
    url = access === "public" ? `/uploads/${filename}` : `/api/uploads/object?key=${encodeURIComponent(filename)}`;
  }

  const record = await prisma.storedObject.create({
    data: {
      filename,
      url,
      contentType: sniffed,
      sizeBytes: bytes.length,
      sha256,
      access,
      driver: storedDriver,
      organisationId: opts?.organisationId || null,
      uploadedById: opts?.uploadedById || null,
    },
  });

  return {
    ok: true,
    file: {
      id: record.id,
      url,
      filename,
      size: bytes.length,
      contentType: sniffed,
      sha256,
      access,
    },
  };
}

export async function deleteStoredObject(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.storedObject.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Not found" };

  if (row.driver === "local") {
    // Resolve from the stored generated filename, never from a URL that could
    // contain traversal segments if a legacy row was tampered with.
    const root = row.url.startsWith("/uploads/")
      ? path.join(process.cwd(), "public", "uploads")
      : path.join(process.cwd(), "data", "uploads-private");
    const full = path.join(root, path.basename(row.filename));
    try {
      await unlink(full);
    } catch {
      // file may already be gone
    }
  } else if (row.driver === "s3") {
    await deleteS3(row.filename).catch(() => undefined);
  }
  await prisma.storedObject.delete({ where: { id } });
  return { ok: true };
}

async function deleteS3(key: string): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKey || !secret) throw new Error("S3 is not configured");
  const importS3 = new Function("return import('@aws-sdk/client-s3')") as () => Promise<{
    S3Client: new (cfg: unknown) => { send: (command: unknown) => Promise<unknown> };
    DeleteObjectCommand: new (input: unknown) => unknown;
  }>;
  const sdk = await importS3();
  const client = new sdk.S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId: accessKey, secretAccessKey: secret },
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  });
  await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function putS3(
  key: string,
  body: Buffer,
  contentType: string,
  access: "private" | "public"
): Promise<{ url: string; driver: "s3" | "local" } | null> {
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  const publicBase = process.env.S3_PUBLIC_BASE_URL;

  if (!bucket || !accessKey || !secret) {
    if (process.env.STORAGE_ALLOW_LOCAL_FALLBACK === "1") {
      const uploadRoot = access === "public"
        ? path.join(process.cwd(), "public", "uploads")
        : path.join(process.cwd(), "data", "uploads-private");
      await mkdir(uploadRoot, { recursive: true });
      await writeFile(path.join(uploadRoot, key), body);
      return {
        url: access === "public" ? `/uploads/${key}` : `/api/uploads/object?key=${encodeURIComponent(key)}`,
        driver: "local",
      };
    }
    return null;
  }

  try {
    // Dynamic import without static type resolution (optional dep)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const importS3 = new Function("return import('@aws-sdk/client-s3')") as () => Promise<{
      S3Client: new (cfg: unknown) => { send: (cmd: unknown) => Promise<unknown> };
      PutObjectCommand: new (input: unknown) => unknown;
      GetObjectCommand?: new (input: unknown) => unknown;
    }>;
    const sdk = await importS3().catch(() => null);
    if (!sdk?.S3Client || !sdk?.PutObjectCommand) {
      if (process.env.STORAGE_ALLOW_LOCAL_FALLBACK === "1") {
        const uploadRoot = access === "public"
          ? path.join(process.cwd(), "public", "uploads")
          : path.join(process.cwd(), "data", "uploads-private");
        await mkdir(uploadRoot, { recursive: true });
        await writeFile(path.join(uploadRoot, key), body);
        return {
          url: access === "public" ? `/uploads/${key}` : `/api/uploads/object?key=${encodeURIComponent(key)}`,
          driver: "local",
        };
      }
      return null;
    }

    const client = new sdk.S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials: { accessKeyId: accessKey, secretAccessKey: secret },
      forcePathStyle: Boolean(endpoint),
    });
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    if (publicBase && access === "public") {
      return { url: `${publicBase.replace(/\/$/, "")}/${key}`, driver: "s3" };
    }
    // Private objects: use API proxy path
    return { url: `/api/uploads/object?key=${encodeURIComponent(key)}`, driver: "s3" };
  } catch {
    return null;
  }
}
