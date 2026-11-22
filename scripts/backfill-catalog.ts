import "dotenv/config";
import { createJobClient } from "../src/lib/db";
import { getSourceAdapter } from "../src/sources/registry";
import { backfillCatalog } from "../src/ingest/catalog";

/**
 * Backfill del Catálogo y refresco diario: el mismo comando (#21).
 *
 * Reanudable por construcción: la identidad vive en `SeriesSource`, así que
 * relanzar completa lo que falta sin duplicar ni re-pedir detalle. Un advisory
 * lock evita que el timer y una corrida manual se solapen.
 */
const log = (event: Record<string, unknown>) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

async function main(): Promise<number> {
  // Cliente de job: una conexión sin eviction, para que el advisory lock de
  // sesión sobreviva los silencios de DB durante un stall del adapter.
  const db = createJobClient();
  const source = getSourceAdapter();
  try {
    const [{ locked }] = await db.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext('manhwa:catalog-backfill')) AS locked
    `;
    if (!locked) {
      log({ event: "lock-busy" });
      return 0;
    }
    const result = await backfillCatalog({ db, source, log });
    log({ event: "done", ...result });
    return result.failed > 0 ? 1 : 0;
  } finally {
    // La conexión libera el lock al cerrarse; sin esto el proceso no termina.
    await db.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    log({ event: "fatal", message: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
