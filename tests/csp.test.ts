import { describe, expect, it } from "vitest";
import { cspOrigins, toCspOrigin } from "@/lib/csp";

describe("CSP origins", () => {
  it("trims pasted line endings and de-duplicates origins", () => {
    const origins = cspOrigins([
      "https://sa-ict-map-public.onrender.com",
      "https://sa-ict-map-ops.onrender.com",
      "https://sa-ict-map-ops.onrender.com\r\n",
    ]);

    expect(origins).toBe(
      "https://sa-ict-map-public.onrender.com https://sa-ict-map-ops.onrender.com"
    );
    expect(() =>
      new Headers().set("Content-Security-Policy", `default-src 'self'; connect-src ${origins}`)
    ).not.toThrow();
  });

  it("uses origins only and rejects unsafe configured values", () => {
    expect(toCspOrigin(" https://example.com/path?query=1 ")).toBe("https://example.com");
    expect(toCspOrigin("https://example.com\nhttps://attacker.example")).toBeNull();
    expect(toCspOrigin("javascript:alert(1)")).toBeNull();
    expect(toCspOrigin("not a URL")).toBeNull();
  });
});
