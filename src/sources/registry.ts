import { FakeSourceAdapter } from "./fake";
import { olympus } from "./olympus";
import type { SourceAdapter } from "./types";

/** El adapter falso parte sin fixtures; cada test inyecta los suyos. */
export const fakeSourceAdapter = new FakeSourceAdapter({
  search: {},
  series: {},
  chapters: {},
  pages: {},
});

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
