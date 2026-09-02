import { describe, expect, it } from "vitest";
import {
  absoluteOpsUrl,
  absolutePublicUrl,
  isAllowedOnOpsPlatform,
  isAllowedOnPublicPlatform,
  isOpsRoute,
} from "@/lib/platform";

describe("platform routes", () => {
  it("classifies ops UI and API routes", () => {
    expect(isOpsRoute("/admin/ops")).toBe(true);
    expect(isOpsRoute("/login")).toBe(true);
    expect(isOpsRoute("/api/admin/users")).toBe(true);
    expect(isOpsRoute("/api/auth/session")).toBe(true);
    expect(isOpsRoute("/")).toBe(false);
    expect(isOpsRoute("/about")).toBe(false);
    expect(isOpsRoute("/api/locations")).toBe(false);
  });

  it("allows public catalogue routes on the map origin", () => {
    expect(isAllowedOnPublicPlatform("/")).toBe(true);
    expect(isAllowedOnPublicPlatform("/about")).toBe(true);
    expect(isAllowedOnPublicPlatform("/api/locations")).toBe(true);
    expect(isAllowedOnPublicPlatform("/admin/ops")).toBe(false);
    expect(isAllowedOnPublicPlatform("/login")).toBe(false);
  });

  it("allows only staff routes on the ops origin", () => {
    expect(isAllowedOnOpsPlatform("/admin/ops")).toBe(true);
    expect(isAllowedOnOpsPlatform("/login")).toBe(true);
    expect(isAllowedOnOpsPlatform("/")).toBe(true);
    expect(isAllowedOnOpsPlatform("/about")).toBe(false);
    expect(isAllowedOnOpsPlatform("/api/locations")).toBe(false);
  });

  it("builds cross-origin redirect URLs", () => {
    expect(absoluteOpsUrl("/login")).toBe("http://localhost:3001/login");
    expect(absolutePublicUrl("/about")).toBe("http://localhost:3000/about");
  });
});
