import { describe, expect, it } from "vitest";
import { JOB_TYPES, snapshotSettingKey } from "@/lib/jobs";
import { dispatchJob } from "@/lib/jobs/handlers";

describe("job catalog", () => {
  it("covers the required production handlers", () => {
    expect(JOB_TYPES).toEqual(
      expect.arrayContaining([
        "analytics.aggregate",
        "data.import",
        "data.duplicates",
        "data.geocode",
        "data.expiry",
        "data.cleanup",
        "notify.deliver",
        "system.report",
        "system.backup",
        "data.ingest",
      ])
    );
  });

  it("rejects unknown job types", async () => {
    await expect(dispatchJob("not.a.job", "job-1", {})).rejects.toThrow(/No handler registered/);
  });

  it("namespaces snapshot keys", () => {
    expect(snapshotSettingKey("analytics.daily", "abc")).toBe("analytics.daily:abc");
  });

  it("namespaces cached job results by province", () => {
    expect(snapshotSettingKey("analytics.daily")).toBe("analytics.daily:national");
    expect(snapshotSettingKey("analytics.daily", "prov-a")).toBe("analytics.daily:prov-a");
    expect(snapshotSettingKey("duplicates.latest", "prov-a")).toBe("duplicates.latest:prov-a");
    expect(snapshotSettingKey("reports.latest")).toBe("reports.latest:national");
  });
});
