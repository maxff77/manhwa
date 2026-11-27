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
  // El celular abre la app por la IP de la LAN. Sin esto, Next rechaza el
  // upgrade del WebSocket de HMR con una respuesta que no es HTTP (medido:
  // `Origin: http://<ip>:3001` → HTTP/0.9; `Origin: http://localhost:3001`
  // → 101). El cliente de Turbopack espera ese canal y la ruta nunca hidrata:
  // el lector se queda en «Cargando Capítulo» aunque la API responda 200.
  // La IP LAN es DHCP (lease ~2 h); el comodín `**.localhost` ya está permitido
  // por defecto pero no cubre IPs numéricas. `*.*.*.*` coincide con cualquier
  // IPv4 que el router asigne sin tener que editar la config cada vez.
  allowedDevOrigins: ["*.*.*.*"],
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
