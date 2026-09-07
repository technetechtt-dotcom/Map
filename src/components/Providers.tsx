"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import ClientSentry from "./ClientSentry";

export default function Providers({ children }: { children: ReactNode }) {
  // Always same-origin auth — never point SessionProvider at the sibling platform.
  return (
    <SessionProvider basePath="/api/auth" refetchOnWindowFocus={false}>
      <ClientSentry />
      {children}
    </SessionProvider>
  );
}
