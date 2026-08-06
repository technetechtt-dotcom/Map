import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canEditContent } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditContent(auth.user.role)) return jsonError("Forbidden", 403);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) return jsonError("file required");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) return jsonError("Max file size 5MB");

  const ext = path.extname(file.name || "").toLowerCase() || ".bin";
  const allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf"];
  if (!allowed.includes(ext)) return jsonError("Unsupported file type");

  const uploadRoot = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadRoot, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  const full = path.join(uploadRoot, filename);
  await writeFile(full, bytes);

  const url = `/uploads/${filename}`;
  await writeAudit({
    userId: auth.user.id,
    action: "UPLOAD",
    entityType: "File",
    entityId: filename,
    metadata: { size: bytes.length, name: file.name },
  });

  return jsonOk({ url, filename, size: bytes.length });
}
