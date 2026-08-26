import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canAccessOpsDashboard } from "@/lib/policy";
import { collectDataQuality } from "@/lib/data-quality";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;
  if (!canAccessOpsDashboard(auth.user)) return jsonError("Forbidden", 403);
  return jsonOk(await collectDataQuality());
}
