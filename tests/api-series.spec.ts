import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

test("GET /api/series responde una lista vacía con la base limpia", async ({ request }) => {
  const response = await request.get("/api/series");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
});

test("GET /api/series lee las Series de Postgres", async ({ request }) => {
  await seedSeries();

  const response = await request.get("/api/series");

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.items).toHaveLength(1);
  expect(body.items[0]).toMatchObject({
    slug: "academia-de-la-ascension",
    title: "Academia de la Ascensión",
    status: "ONGOING",
    type: "MANHWA",
    latestChapter: null,
  });
  expect(body.nextCursor).toBeNull();
});
