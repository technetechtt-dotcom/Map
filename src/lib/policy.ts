/**
 * Central authorization & tenant-scoping policies.
 * All mutating routes must use assertLocationAccess / tenantWhere — deny on null tenants.
 */

import type { RecordStatus, SubmissionStatus } from "@prisma/client";
import { parseStrictBoolean } from "./env";

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PROVINCIAL_ADMIN: "PROVINCIAL_ADMIN",
  ORG_ADMIN: "ORG_ADMIN",
  CONTRIBUTOR: "CONTRIBUTOR",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export type AuthUser = {
  id: string;
  role?: string;
  provinceId?: string | null;
  organisationId?: string | null;
  email?: string | null;
  name?: string | null;
  sessionVersion?: number;
  mustChangePassword?: boolean;
  mfaEnabled?: boolean;
  active?: boolean;
};

export const PUBLIC_LOCATION_STATUSES: RecordStatus[] = ["PUBLISHED"];
export const PUBLIC_ORG_STATUSES: RecordStatus[] = ["PUBLISHED"];

export const PUBLISHABLE_STATUSES: RecordStatus[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "VERIFIED",
  "PUBLISHED",
  "ARCHIVED",
];
export type LocationStatus = RecordStatus;

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
];
export type { SubmissionStatus };

export type LocationRecord = {
  id?: string;
  provinceId: string;
  organisationId?: string | null;
  ownerId?: string | null;
  status?: string | null;
};

export type PolicyResult = { ok: true } | { ok: false; reason: string };

export function isStaffRole(role?: string) {
  return Boolean(role && Object.values(ROLES).includes(role as Role));
}

export function isSuperAdmin(user?: AuthUser | null) {
  return user?.role === ROLES.SUPER_ADMIN;
}

export function isProvincialAdmin(user?: AuthUser | null) {
  return user?.role === ROLES.PROVINCIAL_ADMIN;
}

export function isOrgAdmin(user?: AuthUser | null) {
  return user?.role === ROLES.ORG_ADMIN;
}

export function isContributor(user?: AuthUser | null) {
  return user?.role === ROLES.CONTRIBUTOR;
}

export function canEditDrafts(user?: AuthUser | null) {
  return isStaffRole(user?.role);
}

export function canVerify(user?: AuthUser | null) {
  return isSuperAdmin(user) || isProvincialAdmin(user);
}

export function canPublish(user?: AuthUser | null) {
  return canVerify(user);
}

export function canArchive(user?: AuthUser | null) {
  return canVerify(user);
}

export function canManageUsers(user?: AuthUser | null) {
  return isSuperAdmin(user) || isProvincialAdmin(user);
}

export function canManageAllProvinces(user?: AuthUser | null) {
  return isSuperAdmin(user);
}

export function canManageBackups(user?: AuthUser | null) {
  return isSuperAdmin(user);
}

export function canAccessOpsDashboard(user?: AuthUser | null) {
  return isSuperAdmin(user) || isProvincialAdmin(user);
}

export function canModerateSubmissions(user?: AuthUser | null) {
  return isSuperAdmin(user) || isProvincialAdmin(user);
}

/** MFA required for elevated roles in production (strictly cannot be disabled in production) or when MFA_ENFORCE is set. */
export function requiresMfa(user?: AuthUser | null) {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return isSuperAdmin(user) || isProvincialAdmin(user) || isOrgAdmin(user);
  }
  if (!parseStrictBoolean(process.env.MFA_ENFORCE, false)) {
    return false;
  }
  return isSuperAdmin(user) || isProvincialAdmin(user) || isOrgAdmin(user);
}

/**
 * Province access — DENY when actor or target tenant is unbound (except super admin).
 */
export function assertProvinceAccess(
  user: AuthUser | null | undefined,
  targetProvinceId: string | null | undefined
): PolicyResult {
  if (!user?.id) return { ok: false, reason: "Unauthorized" };
  if (isSuperAdmin(user)) return { ok: true };

  if (isProvincialAdmin(user)) {
    if (!user.provinceId) {
      return { ok: false, reason: "Provincial admin has no province assignment" };
    }
    if (!targetProvinceId) {
      return { ok: false, reason: "Record has no province assignment" };
    }
    if (targetProvinceId !== user.provinceId) {
      return { ok: false, reason: "Outside your province scope" };
    }
    return { ok: true };
  }

  // Org admin / contributor: must be bound to province AND match record
  if (!user.provinceId) {
    return { ok: false, reason: "User has no province assignment" };
  }
  if (!targetProvinceId) {
    return { ok: false, reason: "Record has no province assignment" };
  }
  if (targetProvinceId !== user.provinceId) {
    return { ok: false, reason: "Outside your province scope" };
  }
  return { ok: true };
}

/**
 * Organisation scope — org admins need exact organisationId match (null = DENY).
 */
export function assertOrganisationAccess(
  user: AuthUser | null | undefined,
  targetOrganisationId: string | null | undefined
): PolicyResult {
  if (!user?.id) return { ok: false, reason: "Unauthorized" };
  if (isSuperAdmin(user) || isProvincialAdmin(user)) return { ok: true };

  if (isOrgAdmin(user)) {
    if (!user.organisationId) {
      return { ok: false, reason: "Org admin has no organisation assignment" };
    }
    if (!targetOrganisationId) {
      return { ok: false, reason: "Record is not assigned to an organisation" };
    }
    if (targetOrganisationId !== user.organisationId) {
      return { ok: false, reason: "Outside your organisation scope" };
    }
    return { ok: true };
  }

  // Contributor: if they have an org, cannot touch other orgs; null org records OK only if they own
  if (targetOrganisationId && user.organisationId && targetOrganisationId !== user.organisationId) {
    return { ok: false, reason: "Outside your organisation scope" };
  }
  return { ok: true };
}

/**
 * Record-level location access (read unpublished or write).
 * Contributors: owner only. Org admins: exact organisationId only.
 */
export function assertLocationAccess(
  user: AuthUser | null | undefined,
  record: LocationRecord,
  mode: "read" | "write" = "write"
): PolicyResult {
  if (!user?.id) return { ok: false, reason: "Unauthorized" };
  if (isSuperAdmin(user)) return { ok: true };

  const prov = assertProvinceAccess(user, record.provinceId);
  if (!prov.ok) return prov;

  if (isProvincialAdmin(user)) return { ok: true };

  if (isOrgAdmin(user)) {
    const org = assertOrganisationAccess(user, record.organisationId);
    if (!org.ok) return org;
    return { ok: true };
  }

  if (isContributor(user)) {
    if (mode === "write") {
      if (!record.ownerId || record.ownerId !== user.id) {
        return { ok: false, reason: "Contributors may only modify locations they own" };
      }
    } else {
      // Unpublished records are private drafts: contributors may only read
      // records they own, even when another contributor shares their org.
      if (record.ownerId === user.id) return { ok: true };
      return { ok: false, reason: "Not authorized to view this record" };
    }
    return { ok: true };
  }

  return { ok: false, reason: "Forbidden" };
}

/**
 * Block org-admin claim of unassigned records and cross-tenant reassignment.
 */
export function assertLocationAssignmentChange(
  user: AuthUser | null | undefined,
  existing: LocationRecord,
  nextOrganisationId: string | null | undefined,
  nextProvinceId: string | null | undefined
): PolicyResult {
  if (nextProvinceId !== undefined && nextProvinceId !== existing.provinceId) {
    const p = assertProvinceAccess(user, nextProvinceId);
    if (!p.ok) return p;
    if (!isSuperAdmin(user) && !isProvincialAdmin(user)) {
      return { ok: false, reason: "Only provincial or super administrators may reassign province" };
    }
  }

  if (nextOrganisationId === undefined) return { ok: true };

  if (nextOrganisationId !== (existing.organisationId ?? null)) {
    if (isOrgAdmin(user)) {
      // Cannot claim unassigned, cannot set anything other than own org (and only if already theirs is invalid for claim)
      if (!existing.organisationId) {
        return { ok: false, reason: "Cannot claim an unassigned record" };
      }
      if (!user?.organisationId || nextOrganisationId !== user.organisationId) {
        return { ok: false, reason: "Cannot reassign organisation" };
      }
      if (existing.organisationId !== user.organisationId) {
        return { ok: false, reason: "Outside your organisation scope" };
      }
    } else if (isContributor(user)) {
      return { ok: false, reason: "Contributors cannot reassign organisation" };
    } else if (isProvincialAdmin(user) || isSuperAdmin(user)) {
      return { ok: true };
    }
  }
  return { ok: true };
}

export type EcosystemRecord = {
  id?: string;
  provinceId: string | null;
  organisationId?: string | null;
  status?: string | null;
};

/** Record-level ecosystem access — no ownerId on ecosystem models; org-scoped for org roles. */
export function assertEcosystemAccess(
  user: AuthUser | null | undefined,
  record: EcosystemRecord,
  mode: "read" | "write" = "write"
): PolicyResult {
  void mode;
  if (!user?.id) return { ok: false, reason: "Unauthorized" };
  if (isSuperAdmin(user)) return { ok: true };

  const prov = assertProvinceAccess(user, record.provinceId);
  if (!prov.ok) return prov;

  if (isProvincialAdmin(user)) return { ok: true };

  if (isOrgAdmin(user)) {
    return assertOrganisationAccess(user, record.organisationId);
  }

  if (isContributor(user)) {
    if (!user.organisationId) {
      return { ok: false, reason: "Contributor has no organisation assignment" };
    }
    if (!record.organisationId || record.organisationId !== user.organisationId) {
      return { ok: false, reason: "Outside your organisation scope" };
    }
    return { ok: true };
  }

  return { ok: false, reason: "Forbidden" };
}

export function assertEcosystemAssignmentChange(
  user: AuthUser | null | undefined,
  existing: EcosystemRecord,
  nextOrganisationId: string | null | undefined,
  nextProvinceId: string | null | undefined
): PolicyResult {
  if (nextProvinceId !== undefined && nextProvinceId !== existing.provinceId) {
    const p = assertProvinceAccess(user, nextProvinceId);
    if (!p.ok) return p;
    if (!isSuperAdmin(user) && !isProvincialAdmin(user)) {
      return { ok: false, reason: "Only provincial or super administrators may reassign province" };
    }
  }

  if (nextOrganisationId === undefined) return { ok: true };

  if (nextOrganisationId !== (existing.organisationId ?? null)) {
    if (isOrgAdmin(user)) {
      if (!existing.organisationId) {
        return { ok: false, reason: "Cannot claim an unassigned record" };
      }
      if (!user?.organisationId || nextOrganisationId !== user.organisationId) {
        return { ok: false, reason: "Cannot reassign organisation" };
      }
      if (existing.organisationId !== user.organisationId) {
        return { ok: false, reason: "Outside your organisation scope" };
      }
    } else if (isContributor(user)) {
      return { ok: false, reason: "Contributors cannot reassign organisation" };
    }
  }
  return { ok: true };
}

/** Ecosystem list filter — contributors scoped by organisation, not ownerId. */
export function ecosystemTenantWhere(user: AuthUser | null | undefined): Record<string, unknown> {
  if (!user?.id || isSuperAdmin(user)) return {};
  if (isProvincialAdmin(user)) {
    if (!user.provinceId) return { id: "__none__" };
    return { provinceId: user.provinceId };
  }
  if (isOrgAdmin(user) || isContributor(user)) {
    if (!user.organisationId) return { id: "__none__" };
    return { organisationId: user.organisationId };
  }
  return { id: "__none__" };
}

/**
 * Explicit permitted status transition graph.
 * DRAFT -> PENDING_REVIEW -> VERIFIED -> PUBLISHED -> ARCHIVED
 * With controlled rework/rejection paths (PENDING_REVIEW -> DRAFT).
 */
export const STATUS_TRANSITIONS = {
  ADMIN: {
    DRAFT: ["PENDING_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"],
    PENDING_REVIEW: ["VERIFIED", "DRAFT", "PUBLISHED", "ARCHIVED"],
    VERIFIED: ["PUBLISHED", "PENDING_REVIEW", "DRAFT", "ARCHIVED"],
    PUBLISHED: ["ARCHIVED", "VERIFIED", "PENDING_REVIEW"],
    ARCHIVED: ["DRAFT"],
  },
  STAFF: {
    DRAFT: ["PENDING_REVIEW"],
    PENDING_REVIEW: [], // Once submitted, only admin can review/reject
    VERIFIED: [],
    PUBLISHED: [],
    ARCHIVED: [],
  },
} as const;

export function getAllowedStatusTransitions(
  currentStatus: string,
  user?: AuthUser | null
): string[] {
  const isAdmin = canVerify(user);
  const graph = isAdmin ? STATUS_TRANSITIONS.ADMIN : STATUS_TRANSITIONS.STAFF;
  const allowed = (graph as Record<string, readonly string[]>)[currentStatus] || [];
  if (isAdmin && process.env.REQUIRE_REVIEW_BEFORE_PUBLISH === "1" && currentStatus === "DRAFT") {
    return allowed.filter((s) => s !== "PUBLISHED");
  }
  return [...allowed];
}

export function assertStatusChange(
  user: AuthUser | null | undefined,
  nextStatus: string | undefined,
  previousStatus?: string
): PolicyResult & { status?: string } {
  if (!nextStatus || nextStatus === previousStatus) return { ok: true, status: nextStatus };
  if (!PUBLISHABLE_STATUSES.includes(nextStatus as LocationStatus)) {
    return { ok: false, reason: "Invalid status" };
  }

  const prev = (previousStatus as LocationStatus) || "DRAFT";
  const allowed = getAllowedStatusTransitions(prev, user);

  if (!allowed.includes(nextStatus)) {
    if (!canVerify(user)) {
      return {
        ok: false,
        reason: "Contributors and organisation staff may only submit drafts for review (DRAFT -> PENDING_REVIEW)",
      };
    }
    if (process.env.REQUIRE_REVIEW_BEFORE_PUBLISH === "1" && prev === "DRAFT" && nextStatus === "PUBLISHED") {
      return {
        ok: false,
        reason: "Mandatory review enabled: records must transition via PENDING_REVIEW or VERIFIED before publishing",
      };
    }
    return {
      ok: false,
      reason: `Status transition from ${prev} to ${nextStatus} is not permitted`,
    };
  }

  const elevated = ["VERIFIED", "PUBLISHED"];
  if (elevated.includes(nextStatus) && !canVerify(user)) {
    return {
      ok: false,
      reason: "Only provincial or super administrators may verify or publish records",
    };
  }
  if (nextStatus === "ARCHIVED" && !canArchive(user)) {
    return { ok: false, reason: "Only provincial or super administrators may archive records" };
  }
  return { ok: true, status: nextStatus };
}

export function assertPublishableQuality(coordQuality?: string | null): PolicyResult {
  if (process.env.ENFORCE_COORD_QUALITY !== "1") return { ok: true };
  if (coordQuality === "verified" || coordQuality === "estimated") return { ok: true };
  return {
    ok: false,
    reason: "Publication requires coordQuality of verified or estimated (not town-centre/unknown)",
  };
}

export function coerceCreateStatus(user: AuthUser | null | undefined, requested?: string): RecordStatus {
  if (canPublish(user) && requested && PUBLISHABLE_STATUSES.includes(requested as LocationStatus)) {
    return requested as RecordStatus;
  }
  if (requested === "PENDING_REVIEW") return "PENDING_REVIEW";
  return "DRAFT";
}

/** List query tenant filter — deny-all when tenant unbound */
export function tenantWhere(user: AuthUser | null | undefined): Record<string, unknown> {
  if (!user?.id || isSuperAdmin(user)) return {};
  if (isProvincialAdmin(user)) {
    if (!user.provinceId) return { id: "__none__" };
    return { provinceId: user.provinceId };
  }
  if (isOrgAdmin(user)) {
    if (!user.organisationId) return { id: "__none__" };
    return { organisationId: user.organisationId };
  }
  if (isContributor(user)) {
    // Own records only for management lists
    return { ownerId: user.id };
  }
  return { id: "__none__" };
}

export function submissionTenantWhere(user: AuthUser | null | undefined): Record<string, unknown> {
  if (!user?.id || isSuperAdmin(user)) return {};
  if (isProvincialAdmin(user)) {
    if (!user.provinceId) return { id: "__none__" };
    return { provinceId: user.provinceId };
  }
  return { id: "__none__" };
}

export function auditTenantWhere(user: AuthUser | null | undefined): Record<string, unknown> {
  if (!user?.id || isSuperAdmin(user)) return {};
  if (isProvincialAdmin(user)) {
    if (!user.provinceId) return { id: "__none__" };
    return { provinceId: user.provinceId };
  }
  return { id: "__none__" };
}
