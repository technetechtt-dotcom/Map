import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { isSuperAdmin } from "@/lib/policy";
import { getSetting, isMaintenanceMode, setSetting } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { readJsonLimited } from "@/lib/security";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;
  return jsonOk({
    maintenance: await isMaintenanceMode(),
    envOverride: process.env.MAINTENANCE_MODE === "1",
    message: (await getSetting("maintenance_message")) || null,
  });
}

/** Toggle maintenance mode (super admin only). Env MAINTENANCE_MODE=1 always wins. */
export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "settings", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession(["SUPER_ADMIN"]);
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as { maintenance?: boolean; message?: string };

  if (typeof body.maintenance === "boolean") {
    await setSetting("maintenance", body.maintenance ? "1" : "0");
  }
  if (typeof body.message === "string") {
    await setSetting("maintenance_message", body.message.slice(0, 500));
  }

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "SETTINGS_UPDATE",
    entityType: "AppSetting",
    entityId: "maintenance",
    metadata: { maintenance: body.maintenance, message: body.message },
  });

  return jsonOk({
    maintenance: await isMaintenanceMode(),
    message: (await getSetting("maintenance_message")) || null,
  });
}
