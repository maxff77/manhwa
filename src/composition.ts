import { prisma } from "./lib/db";
import { getSourceAdapter } from "./sources/registry";
import type { SourceAdapter } from "./sources/types";

export interface Composition {
  db: typeof prisma;
  source: SourceAdapter;
}

/**
 * Composition root: Prisma + la Fuente activa. Falla si `SOURCE_ADAPTER` no
 * existe o no tiene adaptador; nunca cae en `fake`.
 */
export function createComposition(): Composition {
  return {
    db: prisma,
    source: getSourceAdapter(),
  };
}
