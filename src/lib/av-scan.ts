/**
 * Optional malware / content-policy hook for uploads.
 * Wire AV_SCAN_URL to a private scanner (ClamAV / commercial API). Never logs file bytes.
 */

export type ScanResult =
  | { ok: true; skipped: boolean; engine?: string }
  | { ok: false; reason: string };

export async function scanUploadBuffer(
  buf: Buffer,
  meta: { filename: string; contentType: string }
): Promise<ScanResult> {
  const url = process.env.AV_SCAN_URL;
  if (!url) {
    if (process.env.AV_SCAN_REQUIRED === "1") {
      return { ok: false, reason: "Malware scan required but AV_SCAN_URL is not configured" };
    }
    return { ok: true, skipped: true };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Number(process.env.AV_SCAN_TIMEOUT_MS || 15_000));
  try {
    const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buf)], { type: meta.contentType }), meta.filename);
    const res = await fetch(url, {
      method: "POST",
      headers: process.env.AV_SCAN_TOKEN
        ? { Authorization: `Bearer ${process.env.AV_SCAN_TOKEN}` }
        : undefined,
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: `Scanner HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as {
      clean?: boolean;
      infected?: boolean;
      threat?: string;
    };
    if (data.infected || data.clean === false) {
      return { ok: false, reason: data.threat || "Malware detected" };
    }
    return { ok: true, skipped: false, engine: "AV_SCAN_URL" };
  } catch (e) {
    if (process.env.AV_SCAN_FAIL_OPEN === "1") {
      return { ok: true, skipped: true, engine: "fail-open" };
    }
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Scanner unreachable",
    };
  } finally {
    clearTimeout(t);
  }
}
