import { describe, expect, it } from "vitest";
import {
  absoluteOpsUrl,
  absolutePublicUrl,
  isAllowedOnOpsPlatform,
  isAllowedOnPublicPlatform,
  isOpsRoute,
  isSharedAuthRoute,
} from "@/lib/platform";

describe("platform routes", () => {
  it("classifies ops UI and API routes", () => {
    expect(isOpsRoute("/admin/ops")).toBe(true);
    expect(isOpsRoute("/dashboard")).toBe(true);
    expect(isOpsRoute("/api/admin/users")).toBe(true);
    expect(isOpsRoute("/login")).toBe(false);
    expect(isOpsRoute("/signup")).toBe(false);
    // NextAuth must stay same-origin on both platforms (no cross-origin redirect)
    expect(isOpsRoute("/api/auth/session")).toBe(false);
    expect(isOpsRoute("/")).toBe(false);
    expect(isOpsRoute("/about")).toBe(false);
    expect(isOpsRoute("/api/locations")).toBe(false);
  });

  it("shares auth pages on both origins", () => {
    expect(isSharedAuthRoute("/login")).toBe(true);
    expect(isSharedAuthRoute("/signup")).toBe(true);
    expect(isSharedAuthRoute("/account/security")).toBe(true);
    expect(isAllowedOnPublicPlatform("/login")).toBe(true);
    expect(isAllowedOnPublicPlatform("/signup")).toBe(true);
    expect(isAllowedOnOpsPlatform("/login")).toBe(true);
    expect(isAllowedOnOpsPlatform("/signup")).toBe(true);
  });

  it("allows public catalogue routes on the map origin", () => {
    expect(isAllowedOnPublicPlatform("/")).toBe(true);
    expect(isAllowedOnPublicPlatform("/about")).toBe(true);
    expect(isAllowedOnPublicPlatform("/api/locations")).toBe(true);
    expect(isAllowedOnPublicPlatform("/api/auth/session")).toBe(true);
    expect(isAllowedOnPublicPlatform("/admin/ops")).toBe(false);
  });

  it("allows staff catalogue APIs on the ops origin (shared Neon DB)", () => {
    expect(isAllowedOnOpsPlatform("/admin/ops")).toBe(true);
    expect(isAllowedOnOpsPlatform("/login")).toBe(true);
    expect(isAllowedOnOpsPlatform("/api/auth/session")).toBe(true);
    expect(isAllowedOnOpsPlatform("/api/locations")).toBe(true);
    expect(isAllowedOnOpsPlatform("/api/meta")).toBe(true);
    expect(isAllowedOnOpsPlatform("/api/uploads")).toBe(true);
    expect(isAllowedOnOpsPlatform("/api/submissions")).toBe(true);
    expect(isAllowedOnOpsPlatform("/")).toBe(true);
    expect(isAllowedOnOpsPlatform("/about")).toBe(false);
  });

  it("builds cross-origin redirect URLs", () => {
    expect(absoluteOpsUrl("/login")).toBe("http://localhost:3001/login");
    expect(absolutePublicUrl("/about")).toBe("http://localhost:3000/about");
  });
});
