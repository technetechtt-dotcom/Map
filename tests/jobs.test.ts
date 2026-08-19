import { describe, expect, it } from "vitest";
import { JOB_TYPES } from "@/lib/jobs";
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
      ])
    );
  });

  it("rejects unknown job types", async () => {
    await expect(dispatchJob("not.a.job", "job-1", {})).rejects.toThrow(/No handler registered/);
  });
});
