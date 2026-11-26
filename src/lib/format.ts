/** Formato compartido del Catálogo y la página de Serie (DESIGN.md: números tabulares, español). */

export const STATUS_LABEL: Record<string, string> = {
  ONGOING: "En emisión",
  COMPLETED: "Completada",
  HIATUS: "En pausa",
  CANCELLED: "Cancelada",
};

export const chapterNumber = new Intl.NumberFormat("es");

export const shortDate = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** La Fuente mezcla «Acción» con «venganza»: se capitaliza solo para mostrar. */
export function genreLabel(genre: string): string {
  return genre.charAt(0).toLocaleUpperCase("es") + genre.slice(1);
}
