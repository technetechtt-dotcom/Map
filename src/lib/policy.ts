/**
 * Central authorization & tenant-scoping policies.
 * All routes must use these helpers instead of ad-hoc role checks.
 */

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
};

export const PUBLISHABLE_STATUSES = ["DRAFT", "PENDING_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"] as const;
export type LocationStatus = (typeof PUBLISHABLE_STATUSES)[number];

/** Roles that may sign in to management surfaces */
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

/** Can create/edit draft content (not publish/verify unless also elevated) */
export function canEditDrafts(user?: AuthUser | null) {
  return isStaffRole(user?.role);
}

/** Province admins and super may verify + publish public records */
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

/** Encrypted backup create/download — super admin only */
export function canManageBackups(user?: AuthUser | null) {
  return isSuperAdmin(user);
}

/**
 * Enforce province scope: provincial admins may only touch their province.
 * Super admins may touch all. Org/contributors must not reassign outside org province unless matching.
 */
export function assertProvinceAccess(
  user: AuthUser | null | undefined,
  targetProvinceId: string | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!user?.id) return { ok: false, reason: "Unauthorized" };
  if (isSuperAdmin(user)) return { ok: true };
  if (isProvincialAdmin(user)) {
    if (!user.provinceId) return { ok: false, reason: "Provincial admin has no province bound" };
    if (targetProvinceId && targetProvinceId !== user.provinceId) {
      return { ok: false, reason: "Outside your province scope" };
    }
    return { ok: true };
  }
  // Org/contributor: must match province if set on user
  if (user.provinceId && targetProvinceId && targetProvinceId !== user.provinceId) {
    return { ok: false, reason: "Outside your province scope" };
  }
  return { ok: true };
}

/**
 * Organisation scope: org admins only their org; others need elevated roles.
 */
export function assertOrganisationAccess(
  user: AuthUser | null | undefined,
  targetOrganisationId: string | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!user?.id) return { ok: false, reason: "Unauthorized" };
  if (isSuperAdmin(user) || isProvincialAdmin(user)) return { ok: true };
  if (isOrgAdmin(user)) {
    if (!user.organisationId) return { ok: false, reason: "Org admin has no organisation bound" };
    if (targetOrganisationId && targetOrganisationId !== user.organisationId) {
      return { ok: false, reason: "Outside your organisation scope" };
    }
    return { ok: true };
  }
  // Contributors may edit own drafts but not other orgs' owned content when org is set
  if (targetOrganisationId && user.organisationId && targetOrganisationId !== user.organisationId) {
    return { ok: false, reason: "Outside your organisation scope" };
  }
  return { ok: true };
}

/**
 * Normalize status transitions — reject publish/verify from org/contributor.
 */
export function assertStatusChange(
  user: AuthUser | null | undefined,
  nextStatus: string | undefined,
  previousStatus?: string
): { ok: true; status?: string } | { ok: false; reason: string } {
  if (!nextStatus || nextStatus === previousStatus) return { ok: true, status: nextStatus };
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

/** Force lower roles to DRAFT / PENDING_REVIEW only on create */
export function coerceCreateStatus(user: AuthUser | null | undefined, requested?: string): string {
  if (canPublish(user) && requested) return requested;
  if (requested === "PENDING_REVIEW") return "PENDING_REVIEW";
  return "DRAFT";
}

/** Prisma where fragment for list queries scoped to tenant */
export function tenantWhere(user: AuthUser | null | undefined): Record<string, unknown> {
  if (!user?.id || isSuperAdmin(user)) return {};
  if (isProvincialAdmin(user) && user.provinceId) {
    return { provinceId: user.provinceId };
  }
  if (isOrgAdmin(user) && user.organisationId) {
    return { organisationId: user.organisationId };
  }
  if (isContributor(user)) {
    return {
      OR: [
        { ownerId: user.id },
        ...(user.organisationId ? [{ organisationId: user.organisationId }] : []),
      ],
    };
  }
  return { id: "__none__" };
}
