import path from "path";
import { fileURLToPath } from "url";

/** @type {import('next').NextConfig} */
const tileCspConnect =
  process.env.MAP_TILE_CONNECT_SRC ||
  "https://*.tile.openstreetmap.org https://tile.openstreetmap.org";

const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp", "dns"],
  poweredByHeader: false,
  // Security headers for all routes including static (middleware also sets CSP dynamically)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/uploads/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
          { key: "Cache-Control", value: "private, max-age=3600" },
        ],
      },
    ];
  },
  env: {
    GIT_COMMIT:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.GIT_COMMIT || "",
    NEXT_PUBLIC_MAP_TILE_URL:
      process.env.NEXT_PUBLIC_MAP_TILE_URL ||
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    NEXT_PUBLIC_MAP_TILE_ATTRIBUTION:
      process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ||
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

export default nextConfig;
// silence unused
void tileCspConnect;
