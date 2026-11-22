import { createJobClient } from "../../src/lib/db";
import { expect, test } from "../support/db";

const KEY = "manhwa:catalog-backfill-idle-probe";

test("el lock del job sobrevive un silencio de DB mayor que el idle timeout del pool", async () => {
  // Un stall del adapter (timeout de 30 s + backoff) deja la conexión idle.
  // Con el pool por defecto (idleTimeoutMillis 10 s) pg cierra esa conexión y
  // el advisory lock de sesión se libera a mitad de corrida (#21, revisión).
  test.setTimeout(60_000);
  const db = createJobClient();
  try {
    const [{ locked }] = await db.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${KEY})) AS locked
    `;
    expect(locked).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 12_000));

    const [{ held }] = await db.$queryRaw<Array<{ held: number }>>`
      SELECT count(*)::int AS held
      FROM pg_locks
      WHERE locktype = 'advisory' AND objid = hashtext(${KEY})::oid
    `;
    expect(held).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
