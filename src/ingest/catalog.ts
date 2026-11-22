import type { PrismaClient, Source, SeriesStatus } from "../generated/prisma/client";
import { normalizeTitle } from "../lib/normalize";
import {
  SourceError,
  type SourceAdapter,
  type SourceSeriesDetail,
  type SourceSeriesStatus,
  type SourceSeriesSummary,
} from "../sources/types";

export interface IngestDeps {
  db: PrismaClient;
  source: SourceAdapter;
  log: (event: Record<string, unknown>) => void;
}

const STATUS: Record<SourceSeriesStatus, SeriesStatus> = {
  ongoing: "ONGOING",
  completed: "COMPLETED",
  hiatus: "HIATUS",
  cancelled: "CANCELLED",
};

const SOURCE_NAMES: Record<string, string> = {
  olympus: "Olympus",
  fake: "Fuente falsa",
};

/** Upsert de la Fuente por slug; el backfill no crea Fuentes nuevas a mano. */
export async function ensureSource(db: PrismaClient, slug: string): Promise<Source> {
  const name = SOURCE_NAMES[slug] ?? slug;
  return db.source.upsert({ where: { slug }, create: { slug, name }, update: { name } });
}

/** Slug interno en kebab-case sobre el título normalizado (v1.md). */
export function slugify(title: string): string {
  return normalizeTitle(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function freeSlug(db: PrismaClient, title: string): Promise<string> {
  const base = slugify(title) || "serie";
  // ponytail: check-then-insert; el advisory lock del job serializa las pasadas.
  // Si entra otro escritor, la constraint unique de `slug` lo detecta y hay que reintentar.
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await db.series.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
}

function detailData(detail: SourceSeriesDetail, summary: SourceSeriesSummary) {
  const status = detail.status ?? summary.status;
  return {
    title: detail.title,
    titleNormalized: normalizeTitle(detail.title),
    ...(detail.synopsis !== undefined ? { synopsis: detail.synopsis } : {}),
    coverSourceUrl: detail.coverUrl ?? summary.coverUrl ?? null,
    genres: detail.genres,
    authors: detail.authors,
    year: detail.year ?? null,
    ...(status ? { status: STATUS[status] } : {}),
  };
}

/**
 * Upsert de una Serie del Catálogo. La identidad vive en `SeriesSource
 * (sourceId, externalId)`; el slug interno solo se asigna al crear.
 *
 * Existente con Capítulos: solo título, portada y estado (refresco diario).
 * Nueva o sin Capítulos: detalle completo + primera página de Capítulos.
 * Nunca marca `chaptersSyncedAt`: eso es de la sincronización al visitar (v1.md).
 */
export async function ingestSeries(
  deps: IngestDeps,
  sourceRow: Source,
  summary: SourceSeriesSummary,
): Promise<{ seriesId: string; created: boolean }> {
  const { db, source, log } = deps;
  const link = await db.seriesSource.findUnique({
    where: { sourceId_externalId: { sourceId: sourceRow.id, externalId: summary.externalId } },
    include: { series: { select: { id: true, _count: { select: { chapters: true } } } } },
  });

  if (link && link.series._count.chapters > 0) {
    await db.$transaction([
      db.series.update({
        where: { id: link.seriesId },
        data: {
          title: summary.title,
          titleNormalized: normalizeTitle(summary.title),
          coverSourceUrl: summary.coverUrl ?? null,
          ...(summary.status ? { status: STATUS[summary.status] } : {}),
        },
      }),
      db.seriesSource.update({ where: { id: link.id }, data: { url: summary.url } }),
    ]);
    return { seriesId: link.seriesId, created: false };
  }

  const detail = await source.getSeries(summary.externalId);
  const recent = await source.listRecentChapters(summary.externalId);
  const data = detailData(detail, summary);

  // Serie + vínculo + Capítulos en una sola transacción: un corte no puede
  // dejar una Serie sin SeriesSource ocupando el slug para siempre (#21).
  const seriesId = await db.$transaction(async (tx) => {
    let id: string;
    if (link) {
      id = link.seriesId;
      await tx.series.update({ where: { id }, data });
      await tx.seriesSource.update({ where: { id: link.id }, data: { url: detail.url } });
    } else {
      const created = await tx.series.create({
        data: {
          ...data,
          slug: await freeSlug(tx as PrismaClient, detail.title),
          status: data.status ?? "ONGOING",
        },
        select: { id: true },
      });
      id = created.id;
      await tx.seriesSource.create({
        data: {
          seriesId: id,
          sourceId: sourceRow.id,
          externalId: summary.externalId,
          url: detail.url,
        },
      });
    }

    const valid = recent.items.filter((chapter) => {
      if (chapter.number === null) {
        log({
          event: "chapter-skipped",
          reason: "number-null",
          seriesExternalId: summary.externalId,
          externalId: chapter.externalId,
        });
        return false;
      }
      return true;
    });
    if (valid.length > 0) {
      const inserted = await tx.chapter.createMany({
        data: valid.map((chapter) => ({
          seriesId: id,
          sourceId: sourceRow.id,
          externalId: chapter.externalId,
          number: chapter.number as number,
          title: chapter.title ?? null,
          publishedAt: chapter.publishedAt ?? null,
        })),
        skipDuplicates: true,
      });
      if (inserted.count < valid.length) {
        log({
          event: "chapter-duplicate",
          seriesExternalId: summary.externalId,
          expected: valid.length,
          inserted: inserted.count,
        });
      }
    }
    return id;
  });

  return { seriesId, created: !link };
}

/**
 * Recorre el Catálogo completo de la Fuente y hace upsert de cada Serie.
 *
 * Reanudable por construcción: la identidad vive en `SeriesSource`, así que
 * reejecutar salta lo ya ingerido sin volver a pedir detalle. Un fallo en una
 * Serie se registra y se sigue; un fallo del listado corta el recorrido (sin
 * listado no hay nada que recorrer) y lo persistido queda intacto.
 */
export async function backfillCatalog(
  deps: IngestDeps,
): Promise<{ pages: number; processed: number; failed: number }> {
  const { db, source, log } = deps;
  const sourceRow = await ensureSource(db, source.slug);
  let cursor: string | undefined;
  let pages = 0;
  let processed = 0;
  let failed = 0;

  do {
    let page;
    try {
      page = await source.search("", cursor);
    } catch (error) {
      if (!(error instanceof SourceError)) throw error;
      log({ event: "catalog-failed", kind: error.kind, message: error.message });
      throw error;
    }
    pages++;
    log({ event: "page", page: pages, items: page.items.length });

    for (const summary of page.items) {
      try {
        const { seriesId, created } = await ingestSeries(deps, sourceRow, summary);
        processed++;
        if (created) {
          const serie = await db.series.findUniqueOrThrow({
            where: { id: seriesId },
            select: { slug: true },
          });
          log({ event: "series-created", externalId: summary.externalId, slug: serie.slug });
        }
      } catch (error) {
        // Solo fallos de la Fuente: cualquier otro error es un bug y se propaga.
        if (!(error instanceof SourceError)) throw error;
        failed++;
        log({
          event: "series-failed",
          externalId: summary.externalId,
          kind: error.kind,
          message: error.message,
        });
      }
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);

  return { pages, processed, failed };
}
