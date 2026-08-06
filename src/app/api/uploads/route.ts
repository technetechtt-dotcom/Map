import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireSession, enforceRateLimit } from "@/lib/api";
import { canEditDrafts } from "@/lib/policy";
import { writeAudit } from "@/lib/audit";
import { validateAndStoreUpload } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "upload", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) return jsonError("file required");

  const result = await validateAndStoreUpload(file);
  if (!result.ok) return jsonError(result.error, 400);

  await writeAudit({
    userId: auth.user.id,
    action: "UPLOAD",
    entityType: "File",
    entityId: result.file.filename,
    metadata: {
      size: result.file.size,
      contentType: result.file.contentType,
      sha256: result.file.sha256,
    },
  });

  return jsonOk(result.file);
}
