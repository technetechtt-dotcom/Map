/** @type {import('next').NextConfig} */
const tileCspConnect =
  process.env.MAP_TILE_CONNECT_SRC ||
  "https://*.tile.openstreetmap.org https://tile.openstreetmap.org";

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs", "sharp"],
  },
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
