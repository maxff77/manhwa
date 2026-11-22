/**
 * Normalización de títulos del dominio: NFD sin diacríticos, minúsculas,
 * espacios colapsados. La puntuación se conserva (search.md).
 *
 * Es la función canónica para `titleNormalized` y `originalTitleNormalized`;
 * cambiarla obliga a re-backfillear ambas columnas.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
