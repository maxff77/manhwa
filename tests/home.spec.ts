import { expect, test } from "./support/db";

test("la home carga sin errores y muestra el Catálogo vacío", async ({ page }) => {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Catálogo" })).toBeVisible();
  await expect(page.getByText("El Catálogo está vacío")).toBeVisible();
  expect(errors).toEqual([]);
});

test("el tema sigue al sistema y aplica los tokens de HeroUI", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("body")).toHaveCSS("font-family", /Geist/);
  const lightBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const darkBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );

  expect(lightBackground).not.toBe(darkBackground);
});
