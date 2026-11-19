import { getAdapter, getSourceAdapter } from "../../src/sources/registry";
import { expect, test } from "@playwright/test";

// Cableado de Fuentes: todavía no hay consumidor HTTP; la ingesta lo cubrirá
// por el seam de la app. Mientras tanto se verifica la composición directamente.
const originalSourceAdapter = process.env.SOURCE_ADAPTER;

test.afterEach(() => {
  if (originalSourceAdapter === undefined) {
    delete process.env.SOURCE_ADAPTER;
  } else {
    process.env.SOURCE_ADAPTER = originalSourceAdapter;
  }
});

test("SOURCE_ADAPTER=fake compone el adaptador falso", () => {
  process.env.SOURCE_ADAPTER = "fake";

  expect(getSourceAdapter().slug).toBe("fake");
});

test("sin SOURCE_ADAPTER no se cae en el adaptador falso", () => {
  delete process.env.SOURCE_ADAPTER;

  expect(() => getSourceAdapter()).toThrow("SOURCE_ADAPTER no configurada");
});

test("una Fuente sin adaptador no se cae en el adaptador falso", () => {
  process.env.SOURCE_ADAPTER = "olympus";

  expect(() => getSourceAdapter()).toThrow("Fuente sin adapter: olympus");
});

test("getAdapter resuelve la Fuente por slug", () => {
  expect(getAdapter("fake").slug).toBe("fake");
});

test("getAdapter falla con un error claro para una Fuente desconocida", () => {
  expect(() => getAdapter("desconocida")).toThrow("Fuente sin adapter: desconocida");
});
