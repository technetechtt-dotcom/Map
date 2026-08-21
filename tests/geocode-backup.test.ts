import { describe, expect, it } from "vitest";
import { geocodeAddress, geocoderDisabled } from "@/lib/geocode";
import { objectBackupConfigured } from "@/lib/backup-health";
import { productionBootGaps } from "@/lib/production-boot";

describe("object backup configuration", () => {
  it("requires a dedicated backup bucket", () => {
    expect(objectBackupConfigured({ S3_BUCKET: "src", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" })).toBe(false);
    expect(
      objectBackupConfigured({
        S3_BUCKET: "src",
        S3_BACKUP_BUCKET: "dst",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
      })
    ).toBe(true);
  });

  it("is a production boot gap when missing", () => {
    const gaps = productionBootGaps({ NODE_ENV: "production", STORAGE_DRIVER: "s3", S3_BUCKET: "src" });
    expect(gaps).toContain("S3_BACKUP_BUCKET");
  });
});

describe("address geocoding", () => {
  it("parses a Nominatim hit inside South Africa", async () => {
    const hit = await geocodeAddress("Kimberley", async () =>
      new Response(JSON.stringify([{ lat: "-28.7282", lon: "24.7499", display_name: "Kimberley" }]), { status: 200 }),
      {}
    );
    expect(hit).toEqual({
      latitude: -28.7282,
      longitude: 24.7499,
      label: "Kimberley",
      source: "nominatim",
    });
  });

  it("rejects coordinates outside the SA envelope", async () => {
    const hit = await geocodeAddress("London", async () =>
      new Response(JSON.stringify([{ lat: "51.5", lon: "-0.1", display_name: "London" }]), { status: 200 }),
      {}
    );
    expect(hit).toBeNull();
  });

  it("is disabled in e2e", () => {
    expect(geocoderDisabled({ E2E: "1" })).toBe(true);
    expect(geocoderDisabled({ GEOCODER_DISABLED: "1" })).toBe(true);
  });
});
