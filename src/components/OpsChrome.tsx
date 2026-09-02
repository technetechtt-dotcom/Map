"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { PRODUCT_NAME } from "@/lib/brand";

export default function OpsChrome() {
  const { data: session } = useSession();
  const role = String((session?.user as { role?: string } | undefined)?.role || "");

  return (
    <header className="site-header">
      <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Platform console</p>
          <Link href="/admin/ops" className="block text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {PRODUCT_NAME} Ops
          </Link>
          <p className="subtitle max-w-2xl text-sm md:text-base">
            Staff operations — separate from the public map
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role ? (
            <>
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-2 text-sm text-white">
                {role.replace(/_/g, " ")}
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="secondary-button">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
