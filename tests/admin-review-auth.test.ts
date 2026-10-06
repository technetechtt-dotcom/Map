/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies before imports
vi.mock("@/lib/prisma", () => {
  const mockLocations: any[] = [];
  const mockExternalIdentities: any[] = [];
  const mockTranslations: any[] = [];
  const mockReviewActions: any[] = [];

  return {
    prisma: {
      location: {
        findUnique: vi.fn(async ({ where }: any) => {
          return mockLocations.find((l) => l.id === where.id || l.slug === where.slug) || null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          let res = [...mockLocations];
          if (where?.provinceId) res = res.filter((l) => l.provinceId === where.provinceId);
          if (where?.status?.in) res = res.filter((l) => where.status.in.includes(l.status));
          if (where?.missingFromSource) res = res.filter((l) => l.missingFromSource);
          return res;
        }),
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `loc-${Date.now()}`, ...data };
          mockLocations.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const idx = mockLocations.findIndex((l) => l.id === where.id);
          if (idx !== -1) {
            mockLocations[idx] = { ...mockLocations[idx], ...data };
            return mockLocations[idx];
          }
          return { id: where.id, ...data };
        }),
      },
      reverificationCampaign: {
        findMany: vi.fn(async () => []),
      },
      entityReviewAction: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `rev-${Date.now()}`, ...data };
          mockReviewActions.push(row);
          return row;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.actorId) return mockReviewActions.filter((r) => r.actorId === where.actorId);
          return mockReviewActions;
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          return mockReviewActions.find((r) => r.id === where.id) || null;
        }),
      },
      sourceRecord: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      ingestionChange: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      externalIdentity: {
        findMany: vi.fn(async ({ where }: any) => {
          return mockExternalIdentities.filter((e) => e.entityId === where.entityId);
        }),
        delete: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      translation: {
        findMany: vi.fn(async ({ where }: any) => {
          return mockTranslations.filter((t) => t.entityId === where.entityId);
        }),
        count: vi.fn(async () => 0),
        delete: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      correctionRequest: {
        count: vi.fn(async () => 0),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      nationalEntity: {
        count: vi.fn(async () => 0),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      analyticsEvent: {
        count: vi.fn(async () => 0),
        findMany: vi.fn(async () => []),
        update: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (cb: any) => cb({
        sourceRecord: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        ingestionChange: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        externalIdentity: {
          findMany: vi.fn(async () => []),
          delete: vi.fn(async () => ({})),
          update: vi.fn(async () => ({})),
          updateMany: vi.fn(async () => ({ count: 1 })),
          create: vi.fn(async () => ({})),
        },
        translation: {
          findMany: vi.fn(async () => []),
          delete: vi.fn(async () => ({})),
          update: vi.fn(async () => ({})),
          updateMany: vi.fn(async () => ({ count: 1 })),
          create: vi.fn(async () => ({})),
        },
        correctionRequest: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        nationalEntity: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        analyticsEvent: { findMany: vi.fn(async () => []), update: vi.fn(async () => ({})) },
        location: {
          create: vi.fn(async ({ data }: any) => ({ id: `new-loc-${Date.now()}`, ...data })),
          update: vi.fn(async ({ where, data }: any) => {
            const idx = mockLocations.findIndex((l) => l.id === where.id);
            if (idx !== -1) {
              mockLocations[idx] = { ...mockLocations[idx], ...data };
              return mockLocations[idx];
            }
            return { id: where.id, ...data };
          }),
          findUnique: vi.fn(async ({ where }: any) => {
            return mockLocations.find((l) => l.id === where.id) || null;
          }),
        },
        entityReviewAction: {
          create: vi.fn(async ({ data }: any) => {
            const row = { id: `act-${Date.now()}`, ...data };
            mockReviewActions.push(row);
            return row;
          }),
        },
      })),
      __mockData: {
        locations: mockLocations,
        externalIdentities: mockExternalIdentities,
        translations: mockTranslations,
        reviewActions: mockReviewActions,
      },
    },
  };
});

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/server-memo", () => ({
  invalidatePublicCaches: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  previewLocationMerge,
  executeLocationMerge,
  executeLocationSplit,
  rollbackLocationMerge,
} from "@/lib/entity-merge";
import { assertProvinceAccess } from "@/lib/policy";

describe("Admin Review & Entity Resolution Authorization", () => {
  const superAdmin = {
    id: "usr-super",
    role: "SUPER_ADMIN",
    email: "super@ictmap.gov.za",
  };

  const ncAdmin = {
    id: "usr-nc",
    role: "PROVINCIAL_ADMIN",
    provinceId: "prov-nc",
    email: "nc@ictmap.gov.za",
  };

  const wcAdmin = {
    id: "usr-wc",
    role: "PROVINCIAL_ADMIN",
    provinceId: "prov-wc",
    email: "wc@ictmap.gov.za",
  };

  const unassignedProvAdmin = {
    id: "usr-unassigned",
    role: "PROVINCIAL_ADMIN",
    provinceId: null,
    email: "unassigned@ictmap.gov.za",
  };

  beforeEach(() => {
    const mock = (prisma as any).__mockData;
    mock.locations.length = 0;
    mock.externalIdentities.length = 0;
    mock.translations.length = 0;
    mock.reviewActions.length = 0;

    // Seed test locations
    mock.locations.push(
      {
        id: "loc-nc-1",
        slug: "upington-hub",
        name: "Upington Hub",
        status: "DRAFT",
        provinceId: "prov-nc",
        organisationId: "org-1",
        canonicalKey: "nc-upington-1",
        sources: [],
        ingestionChanges: [],
      },
      {
        id: "loc-nc-2",
        slug: "upington-digital",
        name: "Upington Digital Centre",
        status: "PENDING_REVIEW",
        provinceId: "prov-nc",
        organisationId: "org-1",
        canonicalKey: "nc-upington-2",
        sources: [],
        ingestionChanges: [],
      },
      {
        id: "loc-wc-1",
        slug: "cape-town-lab",
        name: "Cape Town Innovation Lab",
        status: "DRAFT",
        provinceId: "prov-wc",
        organisationId: "org-2",
        canonicalKey: "wc-cpt-1",
        sources: [],
        ingestionChanges: [],
      },
      {
        id: "loc-null-prov",
        slug: "unassigned-hub",
        name: "Unassigned Hub",
        status: "DRAFT",
        provinceId: null as any,
        organisationId: null,
        sources: [],
        ingestionChanges: [],
      }
    );
  });

  it("fails closed when provincial admin has no assigned province", () => {
    const access = assertProvinceAccess(unassignedProvAdmin, "prov-nc");
    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.reason).toMatch(/no province assignment/i);
    }
  });

  it("fails closed when record has no assigned province", () => {
    const access = assertProvinceAccess(ncAdmin, null);
    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.reason).toMatch(/no province assignment/i);
    }
  });

  it("blocks cross-province access for provincial admins", () => {
    const access = assertProvinceAccess(ncAdmin, "prov-wc");
    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.reason).toMatch(/outside your province/i);
    }
    expect(assertProvinceAccess(wcAdmin, "prov-nc").ok).toBe(false);
  });

  it("allows province access when provincial admin matches record province", () => {
    const access = assertProvinceAccess(ncAdmin, "prov-nc");
    expect(access.ok).toBe(true);
  });

  it("allows super admin access across all provinces", () => {
    expect(assertProvinceAccess(superAdmin, "prov-nc").ok).toBe(true);
    expect(assertProvinceAccess(superAdmin, "prov-wc").ok).toBe(true);
    expect(assertProvinceAccess(superAdmin, null).ok).toBe(true);
  });

  describe("Entity Merge & Conflict Detection", () => {
    it("detects cross-province conflict before merge", async () => {
      const preview = await previewLocationMerge("loc-nc-1", "loc-wc-1", superAdmin);
      expect(preview.ok).toBe(true);
      if (preview.ok) {
        expect(preview.canMerge).toBe(false);
        const conflict = preview.conflicts.find((c) => c.type === "PROVINCE_MISMATCH");
        expect(conflict).toBeDefined();
        expect(conflict?.severity).toBe("error");
      }
    });

    it("prevents provincial admin from previewing cross-province merge", async () => {
      const preview = await previewLocationMerge("loc-nc-1", "loc-wc-1", ncAdmin);
      expect(preview.ok).toBe(false);
      if (!preview.ok) {
        expect(preview.status).toBe(403);
      }
    });

    it("detects canonical key mismatch between entities in the same province", async () => {
      const preview = await previewLocationMerge("loc-nc-1", "loc-nc-2", ncAdmin);
      expect(preview.ok).toBe(true);
      if (preview.ok) {
        const conflict = preview.conflicts.find((c) => c.type === "CANONICAL_KEY_MISMATCH");
        expect(conflict).toBeDefined();
        expect(conflict?.severity).toBe("warning");
      }
    });

    it("executes merge transactionally within province scope", async () => {
      const merge = await executeLocationMerge("loc-nc-1", "loc-nc-2", ncAdmin, {
        notes: "Duplicate confirmed by provincial steward",
        force: true,
      });
      expect(merge.ok).toBe(true);
    });

    it("executes entity split with steward choices", async () => {
      const split = await executeLocationSplit(
        "loc-nc-1",
        {
          name: "Upington Satellite Office",
          latitude: -28.45,
          longitude: 21.24,
          notes: "Separate physical facility split",
        },
        ncAdmin
      );
      expect(split.ok).toBe(true);
    });

    it("rejects cross-province entity split when attempted by provincial admin", async () => {
      const split = await executeLocationSplit(
        "loc-nc-1",
        {
          name: "Cape Town Branch Office",
          latitude: -33.92,
          longitude: 18.42,
          provinceId: "prov-wc", // Attempting to split into Western Cape
          notes: "Attempted cross-province split",
        },
        ncAdmin
      );
      expect(split.ok).toBe(false);
      if (!split.ok) {
        expect(split.status).toBe(403);
        expect(split.error).toMatch(/Cross-province split rejected/i);
      }
    });

    it("allows superadmin to execute cross-province entity split", async () => {
      const split = await executeLocationSplit(
        "loc-nc-1",
        {
          name: "Cape Town National Hub",
          latitude: -33.92,
          longitude: 18.42,
          provinceId: "prov-wc",
          notes: "Superadmin cross-province split",
        },
        superAdmin
      );
      expect(split.ok).toBe(true);
    });

    it("preserves prior evidence during merge and allows true merge rollback", async () => {
      // 1. Seed initial evidence on loc-nc-1
      const initialEvidence = [
        { type: "INGESTED", source: "seda-directory", at: "2026-01-01" },
      ];
      await prisma.location.update({
        where: { id: "loc-nc-1" },
        data: { evidenceJson: initialEvidence, status: "PUBLISHED" },
      });

      // 2. Perform merge
      const merge = await executeLocationMerge("loc-nc-1", "loc-nc-2", ncAdmin, {
        notes: "Merging for rollback test",
        force: true,
      });
      expect(merge.ok).toBe(true);
      if (!merge.ok) return;

      // 3. Verify evidence was preserved on source
      const archivedSource = await prisma.location.findUnique({ where: { id: "loc-nc-1" } });
      expect(archivedSource?.status).toBe("ARCHIVED");
      const sourceEvidence = archivedSource?.evidenceJson as any[];
      expect(sourceEvidence.some((e) => e.type === "INGESTED")).toBe(true);
      expect(sourceEvidence.some((e) => e.type === "MERGED_INTO")).toBe(true);

      // 4. Perform true rollback
      const rollback = await rollbackLocationMerge(merge.result.reviewAction.id, ncAdmin);
      expect(rollback.ok).toBe(true);
      if (!rollback.ok) return;

      expect(rollback.result.restoredStatus).toBe("PUBLISHED");

      // 5. Verify source status restored and evidence annotated
      const restoredSource = await prisma.location.findUnique({ where: { id: "loc-nc-1" } });
      expect(restoredSource?.status).toBe("PUBLISHED");
      const restoredEvidence = restoredSource?.evidenceJson as any[];
      expect(restoredEvidence.some((e) => e.type === "MERGE_ROLLED_BACK")).toBe(true);
      expect(restoredEvidence.some((e) => e.type === "MERGED_INTO")).toBe(false);
    });
  });
});
