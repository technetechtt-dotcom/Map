import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: string;
      provinceId?: string | null;
      organisationId?: string | null;
      locale?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    provinceId?: string | null;
    organisationId?: string | null;
    locale?: string;
  }
}
