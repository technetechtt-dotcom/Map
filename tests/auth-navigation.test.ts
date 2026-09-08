import { describe, expect, it } from "vitest";
import {
  defaultPostAuthPath,
  postAuthPath,
  requestedPostAuthPath,
  safePostAuthCallback,
} from "@/lib/auth-navigation";

describe("authentication navigation", () => {
  it("keeps public-origin sessions on the public app", () => {
    expect(defaultPostAuthPath("public", "SUPER_ADMIN")).toBe("/");
    expect(postAuthPath({ platform: "public", role: "CONTRIBUTOR", callbackUrl: "/admin" })).toBe(
      "/"
    );
  });

  it("passes only same-origin ops management callbacks to middleware", () => {
    expect(requestedPostAuthPath("/admin/locations?q=draft", "ops")).toBe(
      "/admin/locations?q=draft"
    );
    expect(requestedPostAuthPath("/admin", "public")).toBe("/");
    expect(requestedPostAuthPath("https://attacker.example", "ops")).toBe("/");
    expect(requestedPostAuthPath("//attacker.example", "ops")).toBe("/");
  });

  it("routes each ops role to an authorized dashboard", () => {
    expect(defaultPostAuthPath("ops", "SUPER_ADMIN")).toBe("/admin/ops");
    expect(defaultPostAuthPath("ops", "PROVINCIAL_ADMIN")).toBe("/admin/ops");
    expect(defaultPostAuthPath("ops", "ORG_ADMIN")).toBe("/admin");
    expect(defaultPostAuthPath("ops", "CONTRIBUTOR")).toBe("/admin");
  });

  it("honors safe authorized callbacks and rejects unsafe ones", () => {
    expect(safePostAuthCallback("/admin/locations?q=draft", "ops", "CONTRIBUTOR")).toBe(
      "/admin/locations?q=draft"
    );
    expect(safePostAuthCallback("/dashboard", "ops", "CONTRIBUTOR")).toBeNull();
    expect(safePostAuthCallback("/admin/ops", "ops", "ORG_ADMIN")).toBeNull();
    expect(safePostAuthCallback("https://attacker.example", "ops", "SUPER_ADMIN")).toBeNull();
    expect(safePostAuthCallback("//attacker.example", "ops", "SUPER_ADMIN")).toBeNull();
  });

  it("always sends forced-password users to account security", () => {
    expect(
      postAuthPath({
        platform: "ops",
        role: "SUPER_ADMIN",
        callbackUrl: "/admin/ops",
        mustChangePassword: true,
      })
    ).toBe("/account/security?force=1");
  });
});
