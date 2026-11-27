import { expect, test } from "./support/db";

test("POST /api/image-errors acepta el beacon y no escribe estado", async ({ request }) => {
  const response = await request.post("/api/image-errors", {
    data: { pageId: "page-1", chapterId: "chapter-1", url: "https://media.example/0.webp" },
  });

  expect(response.status()).toBe(204);
});

test("POST /api/image-errors rechaza forma inválida o payload grande con 400", async ({ request }) => {
  for (const data of [
    {},
    { pageId: "page-1" },
    { pageId: "page-1", chapterId: "chapter-1", url: "ftp://media.example/0.webp" },
    { pageId: "x".repeat(300), chapterId: "chapter-1", url: "https://media.example/0.webp" },
    { pageId: "page-1", chapterId: "chapter-1", url: `https://media.example/${"x".repeat(5000)}` },
  ]) {
    const response = await request.post("/api/image-errors", { data });
    expect(response.status()).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
});