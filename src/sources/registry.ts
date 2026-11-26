import { FakeSourceAdapter, loadFakeFixtures } from "./fake";
import { olympus } from "./olympus";
import type { SourceAdapter } from "./types";

/**
 * El adapter falso parte sin fixtures; cada test inyecta las suyas por
 * constructor. `FAKE_FIXTURES_FILE` permite dar datos a la app corriendo con
 * `SOURCE_ADAPTER=fake` (arnés de v1) sin hardcodearlos aquí.
 */
export const fakeSourceAdapter = new FakeSourceAdapter(
  process.env.FAKE_FIXTURES_FILE
    ? loadFakeFixtures(process.env.FAKE_FIXTURES_FILE)
    : { search: {}, series: {}, chapters: {}, pages: {} },
);

const adapters: Record<string, SourceAdapter> = {
  [fakeSourceAdapter.slug]: fakeSourceAdapter,
  [olympus.slug]: olympus,
};

export function getAdapter(slug: string): SourceAdapter {
  const adapter = adapters[slug];

  if (!adapter) {
    throw new Error(`Fuente sin adapter: ${slug}`);
  }

  return adapter;
}

/**
 * Composition root de Fuentes. `SOURCE_ADAPTER` es obligatoria: sin valor no se
 * elige la Fuente y nunca se cae en `fake`.
 */
export function getSourceAdapter(): SourceAdapter {
  const slug = process.env.SOURCE_ADAPTER;

  if (!slug) {
    throw new Error("SOURCE_ADAPTER no configurada");
  }

  return getAdapter(slug);
}
