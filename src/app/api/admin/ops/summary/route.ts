import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canAccessOpsDashboard } from "@/lib/policy";
import { collectOpsDashboard } from "@/lib/ops-dashboard";

/** Session-gated ops snapshot. Super admin sees infra; provincial admin sees tenant work. */
export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;
  if (!canAccessOpsDashboard(auth.user)) return jsonError("Forbidden", 403);
  const summary = await collectOpsDashboard(auth.user);
  return jsonOk(summary);
}
