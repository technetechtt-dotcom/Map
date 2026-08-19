"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import ClientSentry from "./ClientSentry";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ClientSentry />
      {children}
    </SessionProvider>
  );
}
