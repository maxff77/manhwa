/**
 * Normalización de títulos del dominio: NFD sin diacríticos, minúsculas,
 * espacios colapsados. La puntuación se conserva (search.md).
 *
 * Es la función canónica para `titleNormalized`, y para `originalTitleNormalized`
 * cuando una Fuente exponga `originalTitle` (ninguna lo hace en v1). Cambiarla
 * obliga a re-backfillear las columnas que llene.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
