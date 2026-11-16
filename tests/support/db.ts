import { test as base, expect } from "@playwright/test";

import { prisma } from "../../src/lib/db";

export { expect };

/** Deja la base en un estado conocido: sin filas y sin tocar `_prisma_migrations`. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const names = tables.map(({ tablename }) => `"${tablename}"`).join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

export const test = base.extend<{ cleanDb: void }>({
  cleanDb: [
    async ({}, use) => {
      await resetDb();
      await use();
    },
    { auto: true },
  ],
});
