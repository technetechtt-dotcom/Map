import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
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
          where: { email: credentials.email.toLowerCase() },
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

export function canManageAll(role?: string) {
  return role === "SUPER_ADMIN";
}

export function canManageProvince(role?: string) {
  return role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN";
}

export function canEditContent(role?: string) {
  return ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"].includes(role || "");
}
