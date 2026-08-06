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
  if (driver === "s3") {
    const s3url = await putS3(filename, bytes, sniffed);
    if (!s3url) return { ok: false, error: "Object storage upload failed" };
    url = s3url;
  } else {
    const uploadRoot = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadRoot, { recursive: true });
    await writeFile(path.join(uploadRoot, filename), bytes);
    url = `/uploads/${filename}`;
  }

  const record = await prisma.storedObject.create({
    data: {
      filename,
      url,
      contentType: sniffed,
      sizeBytes: bytes.length,
      sha256,
      access,
      driver,
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

  if (row.driver === "local" && row.url.startsWith("/uploads/")) {
    const full = path.join(process.cwd(), "public", row.url);
    try {
      await unlink(full);
    } catch {
      // file may already be gone
    }
  }
  // S3 delete left for SDK when configured
  await prisma.storedObject.delete({ where: { id } });
  return { ok: true };
}

async function putS3(key: string, body: Buffer, contentType: string): Promise<string | null> {
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  const publicBase = process.env.S3_PUBLIC_BASE_URL;

  if (!bucket || !accessKey || !secret) {
    if (process.env.STORAGE_ALLOW_LOCAL_FALLBACK === "1") {
      const uploadRoot = path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadRoot, { recursive: true });
      await writeFile(path.join(uploadRoot, key), body);
      return `/uploads/${key}`;
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
        const uploadRoot = path.join(process.cwd(), "public", "uploads");
        await mkdir(uploadRoot, { recursive: true });
        await writeFile(path.join(uploadRoot, key), body);
        return `/uploads/${key}`;
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
    if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;
    // Private objects: use API proxy path
    return `/api/uploads/object?key=${encodeURIComponent(key)}`;
  } catch {
    return null;
  }
}
