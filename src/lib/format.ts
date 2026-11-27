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

const relative = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** «hace 5 horas», «ayer», «hace 3 días»; a partir de un mes, la fecha. */
export function timeAgo(date: Date, now: number): string {
  const minutes = Math.round((date.getTime() - now) / 60_000);
  if (minutes === 0) return "ahora mismo"; // Intl da «este minuto»
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  return shortDate.format(date);
}
