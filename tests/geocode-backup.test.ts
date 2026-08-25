import { describe, expect, it } from "vitest";
import { geocodeAddress, geocoderDisabled, geocoderReady, isPublicNominatim } from "@/lib/geocode";
import { geocodeCacheKey } from "@/lib/cache";
import { objectBackupConfigured } from "@/lib/backup-health";
import { productionBootGaps } from "@/lib/production-boot";
import { manifestChecksum, parseObjectBackupCursor, parseObjectManifest } from "@/lib/object-backup";

describe("object backup configuration", () => {
  it("requires independent backup credentials in production", () => {
    expect(
      objectBackupConfigured({
        NODE_ENV: "production",
        S3_BUCKET: "src",
        S3_BACKUP_BUCKET: "dst",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
      })
    ).toBe(false);
    expect(
      objectBackupConfigured({
        NODE_ENV: "production",
        S3_BUCKET: "src",
        S3_BACKUP_BUCKET: "dst",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
        S3_BACKUP_ACCESS_KEY_ID: "bk",
        S3_BACKUP_SECRET_ACCESS_KEY: "bs",
      })
    ).toBe(true);
  });

  it("is a production boot gap when backup credentials are missing", () => {
    const gaps = productionBootGaps({ NODE_ENV: "production", STORAGE_DRIVER: "s3", S3_BUCKET: "src" });
    expect(gaps).toContain("S3_BACKUP_BUCKET");
    expect(gaps).toContain("S3_BACKUP_ACCESS_KEY_ID");
  });

  it("persists a stable manifest checksum used by full and incremental backups", () => {
    const checksum = manifestChecksum([
      { id: "b", sha256: "aa", filename: "b.bin", backupKey: "objects/b", sizeBytes: 2 },
      { id: "a", sha256: "bb", filename: "a.bin", backupKey: "objects/a", sizeBytes: 1 },
    ]);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(
      manifestChecksum([
        { id: "a", sha256: "bb", filename: "a.bin", backupKey: "objects/a", sizeBytes: 1 },
        { id: "b", sha256: "aa", filename: "b.bin", backupKey: "objects/b", sizeBytes: 2 },
      ])
    ).toBe(checksum);
  });

  it("requires backupKey on every object-storage manifest row", () => {
    expect(() => parseObjectManifest([{ id: "a", filename: "a.bin", sha256: "aa", sizeBytes: 1 }])).toThrow(/backupKey/);
    expect(
      parseObjectManifest({
        objects: [{ id: "a", filename: "a.bin", backupKey: "objects/2026-08-25/a.bin", sha256: "aa", sizeBytes: 1 }],
        checksumSha256: "ff",
      })
    ).toEqual([
      { id: "a", filename: "a.bin", backupKey: "objects/2026-08-25/a.bin", sha256: "aa", sizeBytes: 1 },
    ]);
    expect(parseObjectBackupCursor({ lastFullAt: "2026-08-25T00:00:00Z", keys: ["objects/a"] })).toEqual({
      lastFullAt: "2026-08-25T00:00:00Z",
      keys: ["objects/a"],
    });
  });
});

describe("address geocoding", () => {
  const selfHosted = { GEOCODER_URL: "https://geocode.example.test/search" };

  it("blocks public Nominatim", () => {
    expect(isPublicNominatim("https://nominatim.openstreetmap.org/search")).toBe(true);
    expect(geocoderReady({ GEOCODER_URL: "https://nominatim.openstreetmap.org/search" })).toBe(false);
    expect(geocoderReady({ GEOCODER_API_KEY: "pk.test" })).toBe(true);
    expect(geocoderReady(selfHosted)).toBe(true);
  });

  it("parses a self-hosted Nominatim hit inside South Africa", async () => {
    const hit = await geocodeAddress(
      "Kimberley",
      async () => new Response(JSON.stringify([{ lat: "-28.7282", lon: "24.7499", display_name: "Kimberley" }]), { status: 200 }),
      selfHosted
    );
    expect(hit).toEqual({
      latitude: -28.7282,
      longitude: 24.7499,
      label: "Kimberley",
      source: "nominatim",
    });
  });

  it("rejects coordinates outside the SA envelope", async () => {
    const hit = await geocodeAddress(
      "London",
      async () => new Response(JSON.stringify([{ lat: "51.5", lon: "-0.1", display_name: "London" }]), { status: 200 }),
      selfHosted
    );
    expect(hit).toBeNull();
  });

  it("scopes cache keys by provider", () => {
    expect(geocodeCacheKey("Kimberley", "mapbox")).toBe("geocode:v2:mapbox:kimberley");
    expect(geocodeCacheKey("Kimberley", "mapbox")).not.toBe(geocodeCacheKey("Kimberley", "google"));
  });

  it("is disabled in e2e", () => {
    expect(geocoderDisabled({ E2E: "1" })).toBe(true);
    expect(geocoderDisabled({ GEOCODER_DISABLED: "1" })).toBe(true);
  });
});
