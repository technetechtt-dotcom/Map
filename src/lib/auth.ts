/**
 * Extend auth helpers and re-export policy for compatibility.
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
} from "./policy";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { province: true, organisation: true },
        });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          provinceId: user.provinceId,
          organisationId: user.organisationId,
          locale: user.locale,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = session.user as any;
        s.id = token.sub;
        s.role = token.role;
        s.provinceId = token.provinceId;
        s.organisationId = token.organisationId;
        s.locale = token.locale;
      }
      return session;
    },
  },
};

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
