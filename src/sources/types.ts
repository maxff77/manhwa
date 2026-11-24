/** Slug de la Fuente; coincide con `Source.slug` en la DB. */
export type SourceSlug = string;

export type SourceSeriesStatus = "ongoing" | "completed" | "hiatus" | "cancelled";

export interface SourceSeriesSummary {
  /**
   * Identidad estable en la Fuente. Cada adapter decide qué parte de su
   * identidad lo es: Olympus quita el sufijo `-YYYYMMDD-HHMMSSmmm` que su
   * mirror regenera a diario (#21); el fake usa slugs cortos.
   */
  externalId: string;
  title: string;
  coverUrl?: string;
  /** URL canónica de la serie en la Fuente. */
  url: string;
  /** Estado si el listado lo expone; el backfill lo usa sin pedir el detalle (v1 spec). */
  status?: SourceSeriesStatus;
}

export interface SourceSeriesDetail extends SourceSeriesSummary {
  synopsis?: string;
  status?: SourceSeriesStatus;
  genres: string[];
  authors: string[];
  year?: number;
}

export interface SourceChapter {
  /** Segmento de identidad en la URL, no el número parseado. */
  externalId: string;
  /** Número parseado; null si la Fuente no lo expone de forma parseable. */
  number: number | null;
  title?: string;
  publishedAt?: Date;
  url: string;
}

export interface SourceChapterPage {
  /** Capítulos de la página, en el orden de la Fuente. */
  items: SourceChapter[];
  /** Cursor opaco para el pipeline. `undefined` = no hay más resultados. */
  nextCursor?: string;
}

export interface SourcePage {
  /** Índice 0-based en orden de lectura. */
  position: number;
  /** URL absoluta de la imagen; el adapter no la descarga. */
  url: string;
}

export interface SourceSearchPage {
  items: SourceSeriesSummary[];
  /** Cursor opaco para el pipeline. `undefined` = no hay más resultados. */
  nextCursor?: string;
}

export interface SourceAdapter {
  /** Debe coincidir con `Source.slug`. */
  readonly slug: SourceSlug;

  /** Query vacía = recorrer el catálogo. `cursor` es opaco. */
  search(query: string, cursor?: string): Promise<SourceSearchPage>;

  getSeries(externalId: string): Promise<SourceSeriesDetail>;

  /** Lista completa, en el orden de la Fuente. */
  listChapters(seriesExternalId: string): Promise<SourceChapter[]>;

  /** Página de los Capítulos más recientes primero. `cursor` es opaco. */
  listRecentChapters(
    seriesExternalId: string,
    cursor?: string,
  ): Promise<SourceChapterPage>;

  /** Páginas en orden de lectura; `position` es el índice 0-based. */
  getChapterPages(
    seriesExternalId: string,
    chapterExternalId: string,
  ): Promise<SourcePage[]>;
}

export type SourceErrorKind =
  | "NOT_FOUND"
  | "BLOCKED"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "PARSE";

export class SourceError extends Error {
  constructor(
    readonly kind: SourceErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
