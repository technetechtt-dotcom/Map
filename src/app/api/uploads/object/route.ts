import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { canManageAllProvinces, canReadRepositoryDocument } from "@/lib/policy";
import { jsonError, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Stream a private S3-compatible object through the application.  S3 keys
 * are looked up in StoredObject first, so a caller can never turn this route
 * into an arbitrary bucket proxy.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  if (!/^[a-zA-Z0-9._-]{1,200}$/.test(key)) return jsonError("Invalid object key", 400);

  const object = await prisma.storedObject.findFirst({
    where: { filename: key },
    select: {
      filename: true,
      contentType: true,
      access: true,
      driver: true,
      url: true,
      organisationId: true,
      uploadedById: true,
      repositoryDocument: {
        select: {
          id: true,
          uploadedById: true,
          organisationId: true,
          provinceId: true,
          visibility: true,
          status: true,
          groupAccess: {
            select: { group: { select: { members: { select: { userId: true } } } } },
          },
        },
      },
    },
  });
  if (!object) return jsonError("Object not found", 404);

  if (object.access !== "public") {
    const auth = await requireSession();
    if (auth.error) return auth.error;
    const sameOrganisation = Boolean(object.organisationId && object.organisationId === auth.user.organisationId);
    const owner = object.uploadedById === auth.user.id;
    const repository = object.repositoryDocument;
    const repositoryAllowed = Boolean(
      repository &&
      canReadRepositoryDocument(auth.user, {
        uploadedById: repository.uploadedById,
        organisationId: repository.organisationId,
        provinceId: repository.provinceId,
        visibility: repository.visibility,
        status: repository.status,
        groupUserIds: repository.groupAccess.flatMap((entry) => entry.group.members.map((member) => member.userId)),
      })
    );
    if (repository) {
      if (!repositoryAllowed) return jsonError("Forbidden", 403);
    } else if (!owner && !sameOrganisation && !canManageAllProvinces(auth.user)) {
      return jsonError("Forbidden", 403);
    }
    if (repository) {
      await writeAudit({
        user: auth.user,
        action: "REPOSITORY_DOCUMENT_DOWNLOAD",
        entityType: "RepositoryDocument",
        entityId: repository.id,
        provinceId: repository.provinceId,
        organisationId: repository.organisationId,
        metadata: { filename: object.filename },
      });
    }
  }

  if (object.driver === "local") {
    const root = object.url.startsWith("/uploads/")
      ? path.join(process.cwd(), "public", "uploads")
      : path.join(process.cwd(), "data", "uploads-private");
    try {
      const bytes = await readFile(path.join(root, path.basename(object.filename)));
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": object.contentType,
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": object.access === "public" ? "public, max-age=3600" : "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return jsonError("Object not found", 404);
    }
  }

  if (object.driver !== "s3") return jsonError("Unsupported object storage driver", 503);

  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKey || !secret) return jsonError("Object storage is not configured", 503);

  try {
    // Keep the SDK optional for local development and CI.  Production must
    // configure it through STORAGE_DRIVER=s3 and the environment validator.
    const importS3 = new Function("return import('@aws-sdk/client-s3')") as () => Promise<{
      S3Client: new (config: unknown) => { send: (command: unknown) => Promise<{ Body?: unknown }> };
      GetObjectCommand: new (input: unknown) => unknown;
    }>;
    const sdk = await importS3();
    const client = new sdk.S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      credentials: { accessKeyId: accessKey, secretAccessKey: secret },
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    });
    const result = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: object.filename }));
    const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body?.transformToByteArray) return jsonError("Object storage returned no body", 502);
    const bytes = await body.transformToByteArray();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": object.access === "public" ? "public, max-age=3600" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return jsonError("Object storage read failed", 502);
  }
}
