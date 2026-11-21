import {
  createSourceHttp,
  parseSourceBody,
  sourceFetch,
  type SourceHttp,
} from "./http";
import {
  SourceError,
  type SourceAdapter,
  type SourceChapter,
  type SourceChapterPage,
  type SourcePage,
  type SourceSearchPage,
  type SourceSeriesDetail,
  type SourceSeriesStatus,
  type SourceSeriesSummary,
} from "./types";

const BASE = "https://olympusxyz.com";
/** Host trampa medido en #12: Olympus redirige ahí cuando bloquea. */
const TRAP_HOST = "zonaolympus.9thclassresult2026.com";
/** Espaciado entre peticiones al mismo host; base del backoff. */
const DELAY_MS = 500;
/** Tamaño de la paginación local de la Búsqueda (decisión del adapter, #14). */
const SEARCH_PAGE_SIZE = 20;
/** TTL de la caché del catálogo completo para la Búsqueda (#14). */
const CATALOG_TTL_MS = 10 * 60 * 1000;

/** Ítem de catálogo/detalle tal como lo sirve la API de Olympus. */
interface OlympusSeries {
  name: string;
  slug: string;
  cover?: string | null;
  type?: string | null;
  summary?: string | null;
  status?: { id: number; name?: string } | null;
  genres?: Array<{ name: string }> | null;
}

interface OlympusChapter {
  id: number;
  name: string;
  published_at?: string | null;
}

interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Campo inesperado de Olympus: ${field}`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Campo inesperado de Olympus: ${field}`);
  }

  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Campo inesperado de Olympus: ${field}`);
  }

  return value;
}

/** NFD sin diacríticos + minúsculas + trim: la normalización decidida en #14. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
}

/** El slug de página lleva el prefijo de tipo; el de la API no (#13). */
function apiSlug(externalId: string): string {
  const slug = externalId.replace(/^comic-/, "");

  if (!slug) {
    throw new SourceError("NOT_FOUND", `Serie inexistente: ${externalId}`);
  }

  return slug;
}

function seriesUrl(externalId: string): string {
  return `${BASE}/series/${externalId}`;
}

/** Estado por id según los clientes públicos; el nombre es el respaldo. */
function mapStatus(status: OlympusSeries["status"]): SourceSeriesStatus | undefined {
  if (!status) {
    return undefined;
  }

  const byId: Record<number, SourceSeriesStatus> = {
    1: "ongoing",
    3: "hiatus",
    4: "completed",
    5: "cancelled",
  };

  if (byId[status.id]) {
    return byId[status.id];
  }

  const name = normalize(status.name ?? "");

  if (name.includes("finaliz") || name.includes("complet")) return "completed";
  if (name.includes("cancel")) return "cancelled";
  if (name.includes("pausa") || name.includes("hiatus")) return "hiatus";
  if (name.includes("activo") || name.includes("emision")) return "ongoing";

  return undefined;
}

function toSummary(item: OlympusSeries): SourceSeriesSummary {
  const externalId = `comic-${requireString(item.slug, "slug")}`;
  const status = mapStatus(item.status);

  return {
    externalId,
    title: requireString(item.name, "name"),
    ...(item.cover ? { coverUrl: item.cover } : {}),
    url: seriesUrl(externalId),
    ...(status ? { status } : {}),
  };
}

/** Un ítem del Catálogo debe ser un objeto con la forma de Serie; si no, PARSE. */
function toSeriesItem(value: unknown): SourceSeriesSummary {
  if (!isRecord(value)) {
    throw new TypeError("Ítem de catálogo inesperado de Olympus");
  }

  return toSummary(value as unknown as OlympusSeries);
}

function toDetail(item: OlympusSeries): SourceSeriesDetail {
  const summary = toSummary(item);
  const synopsis = item.summary?.trim();
  const status = mapStatus(item.status);

  return {
    ...summary,
    ...(synopsis ? { synopsis } : {}),
    ...(status ? { status } : {}),
    genres: (item.genres ?? []).map((genre) => requireString(genre.name, "genres[].name").trim()),
    // Olympus no expone autores ni año: quedan para una Fuente de metadata (v1 spec).
    authors: [],
  };
}

/** El número se parsea aparte de la identidad; no parseable → null (contrato). */
function chapterNumber(name: string): number | null {
  const match = /^\d+(?:\.\d+)?/.exec(name.trim());

  return match ? Number(match[0]) : null;
}

function toChapter(item: OlympusChapter, externalId: string): SourceChapter {
  const segment = requireString(item.name, "chapters[].name");
  const publishedAt = item.published_at ? new Date(item.published_at) : undefined;

  return {
    externalId: segment,
    number: chapterNumber(segment),
    ...(publishedAt && !Number.isNaN(publishedAt.getTime()) ? { publishedAt } : {}),
    url: `${seriesUrl(externalId)}/capitulo/${encodeURIComponent(segment)}`,
  };
}

/** Cursor opaco de página: `{v:1,p:N}` en base64url (#14). */
function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor: string | undefined): Record<string, unknown> {
  if (!cursor) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pageNumber(cursor: string | undefined): number {
  const page = decodeCursor(cursor).p;

  return typeof page === "number" && Number.isInteger(page) && page >= 1 ? page : 1;
}

export class OlympusSourceAdapter implements SourceAdapter {
  readonly slug = "olympus";

  /** Caché del catálogo completo para la Búsqueda; una sola petición en vuelo. */
  private catalogCache?: { at: number; items: OlympusSeries[] };
  private catalogInFlight?: Promise<OlympusSeries[]>;

  constructor(private readonly http: SourceHttp = createSourceHttp(TRAP_HOST, DELAY_MS)) {}

  private async getJson(url: string): Promise<unknown> {
    const response = await sourceFetch(url, this.http);

    return parseSourceBody(response, (body) => JSON.parse(body));
  }

  /** `/api/series/list` cacheado 10 min, solo Series (`type === "comic"`); un fallo lanza, nunca []. */
  private async catalog(): Promise<OlympusSeries[]> {
    if (this.catalogCache && Date.now() - this.catalogCache.at < CATALOG_TTL_MS) {
      return this.catalogCache.items;
    }

    this.catalogInFlight ??= this.getJson(`${BASE}/api/series/list`)
      .then((body) => {
        if (!isRecord(body)) {
          throw new TypeError("Catálogo de Olympus inesperado");
        }

        const items = requireArray(body.data, "data").filter(
          (item): item is OlympusSeries => isRecord(item) && item.type === "comic",
        );

        this.catalogCache = { at: Date.now(), items };

        return items;
      })
      .finally(() => {
        this.catalogInFlight = undefined;
      });

    return this.catalogInFlight;
  }

  async search(query: string, cursor?: string): Promise<SourceSearchPage> {
    const needle = normalize(query);

    try {
      return await this.searchPage(needle, cursor);
    } catch (error) {
      if (error instanceof SourceError) throw error;

      // Forma inesperada del payload: PARSE, nunca una lista parcial.
      throw new SourceError("PARSE", "Catálogo inesperado de Olympus", error);
    }
  }

  private async searchPage(needle: string, cursor?: string): Promise<SourceSearchPage> {
    if (!needle) {
      const page = pageNumber(cursor);
      const body = await this.getJson(`${BASE}/api/series?page=${page}`);

      if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.series)) {
        throw new TypeError("Catálogo inesperado de Olympus");
      }

      const paginator = body.data.series as unknown as Paginated<OlympusSeries>;
      const items = requireArray(paginator.data, "series.data").map(toSeriesItem);
      const current = requireNumber(paginator.current_page, "current_page");
      const last = requireNumber(paginator.last_page, "last_page");

      return {
        items,
        ...(current < last ? { nextCursor: encodeCursor({ v: 1, p: current + 1 }) } : {}),
      };
    }

    const all = await this.catalog();
    const matches = all.filter((item) => normalize(String(item.name ?? "")).includes(needle));
    // Cursor por offset sobre la caché; si la query cambió, reinicia en 0 (#14).
    const decoded = decodeCursor(cursor);
    const offset =
      decoded.q === needle && typeof decoded.o === "number" && decoded.o >= 0 ? decoded.o : 0;
    const items = matches.slice(offset, offset + SEARCH_PAGE_SIZE).map(toSummary);
    const next = offset + SEARCH_PAGE_SIZE;

    return {
      items,
      ...(next < matches.length ? { nextCursor: encodeCursor({ v: 1, q: needle, o: next }) } : {}),
    };
  }

  async getSeries(externalId: string): Promise<SourceSeriesDetail> {
    const body = await this.getJson(`${BASE}/api/series/${apiSlug(externalId)}?type=comic`);

    try {
      if (!isRecord(body) || !isRecord(body.data)) {
        throw new TypeError("Detalle inesperado de Olympus");
      }

      return toDetail(body.data as unknown as OlympusSeries);
    } catch (error) {
      if (error instanceof SourceError) throw error;

      // Forma inesperada del payload: PARSE, nunca un detalle a medias.
      throw new SourceError("PARSE", `Detalle inesperado de Olympus: ${externalId}`, error);
    }
  }

  private async chaptersPage(
    externalId: string,
    page: number,
    direction: "asc" | "desc",
  ): Promise<{ items: SourceChapter[]; current: number; last: number; total: number }> {
    const url = `${BASE}/api/series/${apiSlug(externalId)}/chapters?page=${page}&direction=${direction}&type=comic`;
    const body = await this.getJson(url);

    if (!isRecord(body) || !isRecord(body.meta)) {
      throw new SourceError("PARSE", `Listado de Capítulos inesperado de Olympus: ${url}`);
    }

    try {
      const items = requireArray(body.data, "data").map((item) => {
        if (!isRecord(item)) {
          throw new TypeError("Capítulo inesperado de Olympus");
        }

        return toChapter(item as unknown as OlympusChapter, externalId);
      });

      return {
        items,
        current: requireNumber(body.meta.current_page, "meta.current_page"),
        last: requireNumber(body.meta.last_page, "meta.last_page"),
        total: requireNumber(body.meta.total, "meta.total"),
      };
    } catch (error) {
      if (error instanceof SourceError) throw error;

      // Forma inesperada del payload: PARSE, nunca una lista parcial.
      throw new SourceError("PARSE", `Listado de Capítulos inesperado de Olympus: ${url}`, error);
    }
  }

  async listChapters(seriesExternalId: string): Promise<SourceChapter[]> {
    const first = await this.chaptersPage(seriesExternalId, 1, "asc");
    const chapters = [...first.items];

    for (let page = 2; page <= first.last; page++) {
      chapters.push(...(await this.chaptersPage(seriesExternalId, page, "asc")).items);
    }

    // Nunca una lista parcial: si falta algo del total anunciado, lanza.
    if (chapters.length < first.total) {
      throw new SourceError(
        "PARSE",
        `Olympus entregó ${chapters.length} de ${first.total} Capítulos de ${seriesExternalId}`,
      );
    }

    return chapters;
  }

  async listRecentChapters(
    seriesExternalId: string,
    cursor?: string,
  ): Promise<SourceChapterPage> {
    const page = await this.chaptersPage(seriesExternalId, pageNumber(cursor), "desc");

    return {
      items: page.items,
      ...(page.current < page.last
        ? { nextCursor: encodeCursor({ v: 1, p: page.current + 1 }) }
        : {}),
    };
  }

  async getChapterPages(
    seriesExternalId: string,
    chapterExternalId: string,
  ): Promise<SourcePage[]> {
    const url = `${seriesUrl(seriesExternalId)}/capitulo/${encodeURIComponent(chapterExternalId)}`;
    const response = await sourceFetch(url, this.http);

    return parseSourceBody(response, (html) => {
      // Las Páginas son los <img> del strip de lectura, en orden (#13, Keiyoushi).
      const strip = /<main[^>]*class="[^"]*\bstrip\b[^"]*"[^>]*>([\s\S]*?)<\/main>/i.exec(html);

      if (!strip) {
        throw new TypeError(`Sin listado de Páginas: ${url}`);
      }

      const pages: SourcePage[] = [];

      for (const img of strip[1].matchAll(/<img\b[^>]*>/gi)) {
        const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(img[0])?.[1];

        if (src) {
          pages.push({ position: pages.length, url: new URL(src, url).href });
        }
      }

      return pages;
    });
  }
}

export const olympus = new OlympusSourceAdapter();
