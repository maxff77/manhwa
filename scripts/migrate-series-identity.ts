import "dotenv/config";
import { createJobClient } from "../src/lib/db";
import { migrateSeriesIdentity } from "../src/ingest/identity";

/**
 * Migración única de la identidad de las Series ya ingeridas (#21).
 *
 * El sufijo `-YYYYMMDD-HHMMSSmmm` que el mirror de Olympus regenera a diario
 * hacía que cada pasada del backfill creara una Serie nueva para la misma obra.
 * Este script deja el slug base como identidad y fusiona los duplicados,
 * conservando la fila más reciente. Una Serie con datos de Usuario no se borra:
 * se registra para revisión humana.
 *
 * Toma el mismo advisory lock que el backfill: no puede correr a la vez que él.
 */
const log = (event: Record<string, unknown>) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

async function main(): Promise<number> {
  const db = createJobClient();
  try {
    const [{ locked }] = await db.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext('manhwa:catalog-backfill')) AS locked
    `;
    if (!locked) {
      log({ event: "lock-busy" });
      return 1;
    }
    const result = await migrateSeriesIdentity({ db, log });
    log({ event: "done", ...result });
    return result.skipped > 0 ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    log({ event: "fatal", message: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
