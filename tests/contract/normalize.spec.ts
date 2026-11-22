import { expect, test } from "@playwright/test";
import { normalizeTitle } from "../../src/lib/normalize";

test("normalizeTitle: NFD sin diacríticos, minúsculas, espacios colapsados, puntuación conservada", () => {
  expect(normalizeTitle("Academia de la Ascensión")).toBe("academia de la ascension");
  expect(normalizeTitle("  SOLO   Leveling  ")).toBe("solo leveling");
  expect(normalizeTitle("Re:Zero")).toBe("re:zero"); // la puntuación se conserva (search.md)
  expect(normalizeTitle("Ünïcödé")).toBe("unicode");
});
