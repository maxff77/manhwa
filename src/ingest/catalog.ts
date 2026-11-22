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

  const seriesId = link
    ? link.seriesId
    : (
        await db.series.create({
          data: { ...data, slug: await freeSlug(db, detail.title), status: data.status ?? "ONGOING" },
          select: { id: true },
        })
      ).id;

  await db.$transaction(async (tx) => {
    if (link) {
      await tx.series.update({ where: { id: seriesId }, data });
      await tx.seriesSource.update({ where: { id: link.id }, data: { url: detail.url } });
    } else {
      await tx.seriesSource.create({
        data: {
          seriesId,
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
    if (valid.length === 0) {
      return;
    }
    const inserted = await tx.chapter.createMany({
      data: valid.map((chapter) => ({
        seriesId,
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
  });

  return { seriesId, created: !link };
}

/** Un fallo del adapter nunca borra filas: aquí solo se escribe (v1.md). */
export function isSourceError(error: unknown): error is SourceError {
  return error instanceof SourceError;
}
