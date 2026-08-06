/**
 * App settings helpers (maintenance mode, feature flags).
 */

import { prisma } from "./prisma";

const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 15_000;

export async function getSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const value = row?.value ?? null;
    if (value != null) cache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  cache.set(key, { value, at: Date.now() });
}

export async function isMaintenanceMode(): Promise<boolean> {
  if (process.env.MAINTENANCE_MODE === "1") return true;
  const v = await getSetting("maintenance");
  return v === "1" || v === "true";
}

export function clearSettingsCache() {
  cache.clear();
}
