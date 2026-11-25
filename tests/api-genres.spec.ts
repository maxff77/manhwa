import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

test("GET /api/genres devuelve los géneros distintos y ordenados", async ({ request }) => {
  await seedSeries({ genres: ["Romance", "Acción"] });
  await seedSeries({
    slug: "beta",
    title: "Beta",
    titleNormalized: "beta",
    genres: ["Acción", "Aventura"],
  });

  const response = await request.get("/api/genres");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ genres: ["Acción", "Aventura", "Romance"] });
});

test("GET /api/genres anuncia caché de una hora", async ({ request }) => {
  const response = await request.get("/api/genres");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("s-maxage=3600");
});
