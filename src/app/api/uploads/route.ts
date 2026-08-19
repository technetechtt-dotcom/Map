import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canEditDrafts, isSuperAdmin } from "@/lib/policy";
import { writeAudit } from "@/lib/audit";
import { deleteStoredObject, validateAndStoreUpload } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "upload", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) return jsonError("file required");
  const access = form.get("access") === "public" ? "public" : "private";

  const result = await validateAndStoreUpload(file, {
    organisationId: auth.user.organisationId,
    uploadedById: auth.user.id,
    access,
  });
  if (!result.ok) return jsonError(result.error, 400);

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "UPLOAD",
    entityType: "StoredObject",
    entityId: result.file.id || result.file.filename,
    organisationId: auth.user.organisationId,
    metadata: {
      size: result.file.size,
      contentType: result.file.contentType,
      sha256: result.file.sha256,
      access: result.file.access,
    },
  });

  return jsonOk(result.file);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("id required");

  const object = await prisma.storedObject.findUnique({
    where: { id },
    select: { uploadedById: true, organisationId: true },
  });
  if (!object) return jsonError("Not found", 404);
  const sameOrganisation = Boolean(object.organisationId && object.organisationId === auth.user.organisationId);
  if (!isSuperAdmin(auth.user) && object.uploadedById !== auth.user.id && !sameOrganisation) {
    return jsonError("Forbidden", 403);
  }

  const result = await deleteStoredObject(id);
  if (!result.ok) return jsonError(result.error, 404);

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "UPLOAD_DELETE",
    entityType: "StoredObject",
    entityId: id,
    organisationId: auth.user.organisationId,
  });

  return jsonOk({ ok: true });
}
