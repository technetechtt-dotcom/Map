import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    error?: string;
    user: {
      id?: string;
      role?: string;
      provinceId?: string | null;
      organisationId?: string | null;
      locale?: string;
      sessionVersion?: number;
      mustChangePassword?: boolean;
      mfaEnabled?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    provinceId?: string | null;
    organisationId?: string | null;
    locale?: string;
    sessionVersion?: number;
    mustChangePassword?: boolean;
    mfaEnabled?: boolean;
    invalid?: boolean;
    lastRefresh?: number;
  }
}
