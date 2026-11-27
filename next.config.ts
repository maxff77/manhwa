import { withReticle } from '@reticlehq/next';
import type { NextConfig } from "next";

// `TEST_IMAGE_ORIGIN` solo lo pone el arnés de tests (playwright.config.ts):
// las Páginas de fixture se sirven desde un origen local. Sin variable, la CSP
// de producción admite únicamente 'self' y el CDN de Olympus (image-pipeline.md).
const imageOrigins = [
  "'self'",
  "https://media.imagesolymp.xyz",
  ...(process.env.TEST_IMAGE_ORIGIN ? [process.env.TEST_IMAGE_ORIGIN] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  `img-src ${imageOrigins} data: blob:`,
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Prisma 7's driver adapter carries Node built-ins; keep it out of the bundle.
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default withReticle(nextConfig);
