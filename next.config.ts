import { withReticle } from '@reticlehq/next';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 7's driver adapter carries Node built-ins; keep it out of the bundle.
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
};

export default withReticle(nextConfig);
