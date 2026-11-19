import {
  SourceError,
  type SourceAdapter,
  type SourceChapter,
  type SourceChapterPage,
  type SourcePage,
  type SourceSearchPage,
  type SourceSeriesDetail,
} from "./types";

export interface FakeFixtures {
  search: Record<string, Record<string, SourceSearchPage>>;
  series: Record<string, SourceSeriesDetail>;
  chapters: Record<string, SourceChapter[]>;
  pages: Record<string, SourcePage[]>;
}

export class FakeSourceAdapter implements SourceAdapter {
  readonly slug = "fake";

  constructor(private readonly fixtures: FakeFixtures) {}

  async search(query: string, cursor?: string): Promise<SourceSearchPage> {
    const page = this.fixtures.search[query]?.[cursor ?? "first"] ?? { items: [] };

    return page;
  }

  async getSeries(externalId: string): Promise<SourceSeriesDetail> {
    const series = this.fixtures.series[externalId];

    if (!series) {
      throw new SourceError("NOT_FOUND", `Serie inexistente: ${externalId}`);
    }

    return series;
  }

  async listChapters(seriesExternalId: string): Promise<SourceChapter[]> {
    return this.fixtures.chapters[seriesExternalId] ?? [];
  }

  async listRecentChapters(
    seriesExternalId: string,
    cursor?: string,
  ): Promise<SourceChapterPage> {
    const all = [...(this.fixtures.chapters[seriesExternalId] ?? [])].reverse();
    const page = Number(cursor ?? "1");
    const items = all.slice((page - 1) * 40, page * 40);

    return { items, nextCursor: page * 40 < all.length ? String(page + 1) : undefined };
  }

  async getChapterPages(
    seriesExternalId: string,
    chapterExternalId: string,
  ): Promise<SourcePage[]> {
    const key = `${seriesExternalId}/${chapterExternalId}`;
    const pages = this.fixtures.pages[key];

    // Un Capítulo vacío es una lista []; la ausencia del listado es un fallo.
    if (!pages) {
      throw new SourceError("PARSE", `Sin listado de Páginas: ${key}`);
    }

    return pages;
  }
}
