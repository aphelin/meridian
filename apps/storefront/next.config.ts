import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

loadEnvConfig(path.resolve(process.cwd(), "../.."));

/** Admin-uploaded product images are served from object storage (S3_PUBLIC_URL); seeded images live in /public. */
function mediaPattern(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const raw = process.env.S3_PUBLIC_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port,
        pathname: `${url.pathname.replace(/\/+$/, "")}/**`,
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // Self-contained server (node server.js) for the Docker image in infra/docker/Dockerfile.storefront.
  output: "standalone",
  // Several dev servers (one per gate or leaf) can run on one checkout, each with its own build directory.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  reactCompiler: true,
  devIndicators: false,
  poweredByHeader: false,
  // 75 for everything; 90 for the full-width home hero, where compression shows on large screens.
  images: { remotePatterns: mediaPattern(), qualities: [75, 90] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  async rewrites() {
    // /shop and /shop/[category] are ISR pages that never read searchParams. A URL carrying a listing filter is rewritten
    // to the per-request /shop-filtered route instead (one rule per key: `has` conditions are AND-ed).
    const filters = ["colour", "material", "min", "max", "stock", "sort"];
    return {
      beforeFiles: filters.flatMap((key) => [
        { source: "/shop", has: [{ type: "query" as const, key }], destination: "/shop-filtered" },
        { source: "/shop/:category", has: [{ type: "query" as const, key }], destination: "/shop-filtered/:category" },
      ]),
    };
  },
  async redirects() {
    return [
      { source: "/wing/:category", destination: "/shop/:category", permanent: true },
      { source: "/piece/:slug", destination: "/product/:slug", permanent: true },
      { source: "/lookbook", destination: "/shop", permanent: true },
      { source: "/account/orders/:id", destination: "/orders/:id", permanent: true },
    ];
  },
};

export default nextConfig;
