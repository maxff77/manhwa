import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL no configurada");
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Cliente para jobs de un solo proceso (backfill del Catálogo, #21).
 *
 * El advisory lock es de sesión: vive en la conexión que lo tomó. El pool por
 * defecto cierra las conexiones idle a los 10 s (`idleTimeoutMillis`), y un
 * stall del adapter (timeout de 30 s + backoff) deja la conexión idle más que
 * eso: pg la cerraba y el lock se liberaba a mitad de corrida. Una sola
 * conexión sin eviction mantiene el lock hasta el `$disconnect`.
 */
export function createJobClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL no configurada");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 1, idleTimeoutMillis: 0 }),
  });
}
