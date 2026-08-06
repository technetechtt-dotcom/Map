/**
 * Secure upload validation + optional object storage (S3-compatible).
 * Local filesystem used when STORAGE_DRIVER=local (default).
 */

import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { MAX_UPLOAD_BYTES } from "@/lib/security";

const ALLOWED: Record<string, string[]> = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".pdf": ["application/pdf"],
};

/** Magic-byte sniff (first bytes) — exported for unit tests */
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
};

export async function validateAndStoreUpload(file: File): Promise<
  { ok: true; file: StoredFile } | { ok: false; error: string }
> {
  const bytes = Buffer.from(await file.arrayBuffer());
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

  // Reject polyglot JS/PDF edge: keep PDF pure
  if (sniffed === "application/pdf" && bytes.includes(Buffer.from("<script", "utf8"))) {
    return { ok: false, error: "Rejected dangerous PDF content" };
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = `${randomUUID()}${ext}`;
  const driver = process.env.STORAGE_DRIVER || "local";

  if (driver === "s3") {
    const url = await putS3(filename, bytes, sniffed);
    if (!url) return { ok: false, error: "Object storage upload failed" };
    return {
      ok: true,
      file: { url, filename, size: bytes.length, contentType: sniffed, sha256 },
    };
  }

  const uploadRoot = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadRoot, { recursive: true });
  await writeFile(path.join(uploadRoot, filename), bytes);
  return {
    ok: true,
    file: {
      url: `/uploads/${filename}`,
      filename,
      size: bytes.length,
      contentType: sniffed,
      sha256,
    },
  };
}

async function putS3(key: string, body: Buffer, contentType: string): Promise<string | null> {
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT; // e.g. https://s3.amazonaws.com or R2
  const region = process.env.S3_REGION || "auto";
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  const publicBase = process.env.S3_PUBLIC_BASE_URL; // CDN URL

  if (!bucket || !accessKey || !secret) return null;

  try {
    // Optional peer dependency — installed only when using STORAGE_DRIVER=s3
    const awsModule = "@aws-sdk/client-s3";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sdk: any = null;
    try {
      // @ts-expect-error optional dependency may be absent
      sdk = await import(awsModule);
    } catch {
      sdk = null;
    }
    if (!sdk?.S3Client || !sdk?.PutObjectCommand) {
      if (process.env.S3_REQUIRE === "1") return null;
      const uploadRoot = path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadRoot, { recursive: true });
      await writeFile(path.join(uploadRoot, key), body);
      return `/uploads/${key}`;
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
        ACL: "private",
      })
    );
    if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;
    return `s3://${bucket}/${key}`;
  } catch {
    return null;
  }
}
