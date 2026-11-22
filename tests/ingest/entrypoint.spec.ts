import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../../src/lib/db";
import { expect, test } from "../support/db";

const run = promisify(execFile);
const env = {
  ...process.env,
  SOURCE_ADAPTER: "fake",
  DATABASE_URL: process.env.DATABASE_URL!,
};

/** Solo las líneas JSON del script; npm imprime su propia cabecera. */
function events(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("el entrypoint corre con el adapter falso y sale 0 con la base limpia", async () => {
  const { stdout } = await run("npm", ["run", "catalog:backfill"], { env });
  const parsed = events(stdout);
  expect(parsed.at(-1)).toMatchObject({ event: "done", pages: 1, processed: 0, failed: 0 });
  expect(typeof parsed[0].ts).toBe("string");
});

test("con el lock tomado, el segundo proceso sale 0 sin tocar la DB", async () => {
  const [{ locked }] = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(hashtext('manhwa:catalog-backfill')) AS locked
  `;
  expect(locked).toBe(true);
  try {
    const { stdout } = await run("npm", ["run", "catalog:backfill"], { env });
    expect(events(stdout).at(-1)).toMatchObject({ event: "lock-busy" });
    expect(await prisma.series.count()).toBe(0);
  } finally {
    await prisma.$executeRaw`
      SELECT pg_advisory_unlock(hashtext('manhwa:catalog-backfill'))
    `;
  }
});

test("sin SOURCE_ADAPTER el entrypoint sale 1 con log fatal", async () => {
  let failure: { code?: number; stdout?: string } | undefined;
  try {
    await run("npm", ["run", "catalog:backfill"], {
      env: { ...env, SOURCE_ADAPTER: "" },
    });
  } catch (error) {
    failure = error as { code?: number; stdout?: string };
  }
  expect(failure?.code).toBe(1);
  expect(events(failure?.stdout ?? "").at(-1)).toMatchObject({ event: "fatal" });
});
