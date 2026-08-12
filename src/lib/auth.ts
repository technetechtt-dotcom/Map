/**
 * Auth with session versioning, lockout, and DB-backed authorization identity.
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import {
  canEditDrafts,
  canManageAllProvinces,
  canManageUsers,
  canPublish,
  canVerify,
  isSuperAdmin,
  type AuthUser,
} from "./policy";
import { rateLimitAsync } from "./rate-limit";
import { log } from "./logger";
import { verifyTotp } from "./totp";
import { clientIpFromHeaders } from "./security";
import { decryptSecret } from "./secret-box";

const MAX_FAILED = Number(process.env.LOGIN_MAX_FAILED || 5);
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA code", type: "text" },
      },
      async authorize(credentials, req) {
        const email = (credentials?.email || "").toLowerCase().trim();
        const password = credentials?.password || "";
        if (!email || !password) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headers = (req as any)?.headers;
        const ip = clientIpFromHeaders(headers);
        const rlIp = await rateLimitAsync(`login:ip:${ip}`, { limit: 20, windowMs: 15 * 60_000 });
        const rlEmail = await rateLimitAsync(`login:email:${email}`, {
          limit: 10,
          windowMs: 15 * 60_000,
        });
        if (!rlIp.ok || !rlEmail.ok) {
          log.warn("login.rate_limited", { email, ip });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          await bcrypt.compare(
            password,
            "$2a$12$invalidhashinvalidhashinvalidhashinvalidhashinvalid"
          );
          return null;
        }

        if (!user.active) return null;

        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          log.warn("login.locked", { email, until: user.lockedUntil.toISOString() });
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          const failed = user.failedLoginCount + 1;
          const lockNow = failed >= MAX_FAILED;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: failed,
              lockedUntil: lockNow
                ? new Date(Date.now() + LOCK_MINUTES * 60_000)
                : user.lockedUntil,
            },
          });
          log.warn("login.failed", { email, failed });
          return null;
        }

        if (user.failedLoginCount > 0) {
          await new Promise((r) => setTimeout(r, Math.min(2000, user.failedLoginCount * 200)));
        }

        const inactivityDays = Number(process.env.ADMIN_INACTIVITY_DAYS || 90);
        if (
          user.lastLoginAt &&
          inactivityDays > 0 &&
          Date.now() - user.lastLoginAt.getTime() > inactivityDays * 24 * 3600 * 1000 &&
          (user.role === "SUPER_ADMIN" || user.role === "PROVINCIAL_ADMIN")
        ) {
          await prisma.user.update({
            where: { id: user.id },
            data: { lockedUntil: new Date(Date.now() + 24 * 3600 * 1000) },
          });
          log.warn("login.inactivity_lock", { email });
          return null;
        }

        if (user.mfaEnabled) {
          const code = (credentials?.mfaCode || "").trim();
          let totpOk = false;
          if (user.mfaSecret) {
            try {
              totpOk = verifyTotp(decryptSecret(user.mfaSecret), code);
            } catch {
              totpOk = false;
            }
          }
          if (!totpOk) {
            const hashes = Array.isArray(user.mfaRecoveryHashes)
              ? (user.mfaRecoveryHashes as string[])
              : [];
            let recovered = false;
            const remaining: string[] = [];
            for (const h of hashes) {
              if (!recovered && h && (await bcrypt.compare(code, h))) {
                recovered = true;
              } else {
                remaining.push(h);
              }
            }
            if (!recovered) return null;
            await prisma.user.update({
              where: { id: user.id },
              data: { mfaRecoveryHashes: remaining },
            });
            log.warn("login.mfa_recovery_used", { email });
          }
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          provinceId: user.provinceId,
          organisationId: user.organisationId,
          locale: user.locale,
          sessionVersion: user.sessionVersion,
          mustChangePassword: user.mustChangePassword,
          mfaEnabled: user.mfaEnabled,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.role = u.role;
        token.provinceId = u.provinceId;
        token.organisationId = u.organisationId;
        token.locale = u.locale;
        token.sessionVersion = u.sessionVersion ?? 0;
        token.mustChangePassword = u.mustChangePassword ?? false;
        token.mfaEnabled = u.mfaEnabled ?? false;
        token.invalid = false;
        token.lastRefresh = Date.now();
      } else if (token.sub) {
        const last = (token.lastRefresh as number) || 0;
        if (Date.now() - last > 60_000) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: {
              role: true,
              provinceId: true,
              organisationId: true,
              locale: true,
              sessionVersion: true,
              mustChangePassword: true,
              mfaEnabled: true,
              active: true,
            },
          });
          if (!dbUser || !dbUser.active) {
            token.invalid = true;
          } else if (
            typeof token.sessionVersion === "number" &&
            dbUser.sessionVersion !== token.sessionVersion
          ) {
            token.invalid = true;
          } else {
            token.role = dbUser.role;
            token.provinceId = dbUser.provinceId;
            token.organisationId = dbUser.organisationId;
            token.locale = dbUser.locale;
            token.sessionVersion = dbUser.sessionVersion;
            token.mustChangePassword = dbUser.mustChangePassword;
            token.mfaEnabled = dbUser.mfaEnabled;
            token.invalid = false;
          }
          token.lastRefresh = Date.now();
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.invalid) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).error = "SessionRevoked";
      }
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = session.user as any;
        s.id = token.sub;
        s.role = token.role;
        s.provinceId = token.provinceId;
        s.organisationId = token.organisationId;
        s.locale = token.locale;
        s.sessionVersion = token.sessionVersion;
        s.mustChangePassword = token.mustChangePassword;
        s.mfaEnabled = token.mfaEnabled;
      }
      return session;
    },
  },
};

export async function revokeUserSessions(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

/** @deprecated use policy */
export function canManageAll(role?: string) {
  return isSuperAdmin({ id: "", role });
}

/** @deprecated use policy */
export function canManageProvince(role?: string) {
  return canManageAllProvinces({ id: "", role }) || role === "PROVINCIAL_ADMIN";
}

/** @deprecated use policy.canEditDrafts */
export function canEditContent(role?: string) {
  return canEditDrafts({ id: "", role });
}

export { canPublish, canVerify, canManageUsers };

// silence unused AuthUser type import when only used in docs
export type { AuthUser };
