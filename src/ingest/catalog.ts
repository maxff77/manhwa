import type {
  Prisma,
  PrismaClient,
  Source,
  SeriesStatus,
} from "../generated/prisma/client";
import { normalizeTitle } from "../lib/normalize";
import {
  SourceError,
  type SourceAdapter,
  type SourceChapter,
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

/**
 * Reintentos del job ante un fallo de transporte del listado. El spec deja el
 * reintento al pipeline, no al adapter (`sourceFetch` lanza UPSTREAM sin
 * reintentar). Olympus entrega los headers y luego tarda con el cuerpo: medido
 * el 2026-11-24, `page=2` abortó a los 30 s leyendo (#21).
 */
const CATALOG_RETRIES = 2;
const CATALOG_RETRY_DELAY_MS = 1_000;
const RETRYABLE = new Set(["UPSTREAM", "RATE_LIMITED", "BLOCKED"]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

async function freeSlug(db: Prisma.TransactionClient, title: string): Promise<string> {
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
          slug: await freeSlug(tx, detail.title),
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

/** Ventana de frescura de la lista completa al visitar una Serie (v1.md). */
const SYNC_TTL_MS = 10 * 60_000;

/**
 * Sincronización al visitar una Serie (#23): si `chaptersSyncedAt` es nulo o
 * tiene más de 10 minutos, pide `getSeries` y la lista completa de Capítulos,
 * los upsertea y marca la fecha. Idempotente: la identidad del Capítulo es
 * `(seriesId, sourceId, externalId)`, así que re-sincronizar no duplica.
 *
 * Un fallo del adapter se registra y se propaga sin tocar lo persistido: nunca
 * se sirve ni se guarda una lista parcial.
 */
export async function syncSeries(deps: IngestDeps, slug: string): Promise<void> {
  const { db, source, log } = deps;
  const serie = await db.series.findUnique({
    where: { slug },
    select: { id: true, sources: { include: { source: { select: { slug: true } } } } },
  });
  if (!serie) throw new Error(`Serie inexistente: ${slug}`);

  // v1 es una sola Fuente por Serie; el vínculo de la Fuente inyectada es el
  // que se sincroniza. El registry no entra aquí: los tests inyectan el fake.
  const link = serie.sources.find((v) => v.source.slug === source.slug);
  if (!link) {
    log({ event: "series-sync-skipped", slug, reason: "no-link-for-source", source: source.slug });
    return;
  }

  if (
    link.chaptersSyncedAt === null ||
    Date.now() - link.chaptersSyncedAt.getTime() >= SYNC_TTL_MS
  ) {
    let detail: SourceSeriesDetail;
    let chapters: SourceChapter[];
    try {
      detail = await source.getSeries(link.externalId);
      chapters = await source.listChapters(link.externalId);
    } catch (error) {
      if (!(error instanceof SourceError)) throw error;
      log({
        event: "series-sync-failed",
        slug,
        externalId: link.externalId,
        kind: error.kind,
        message: error.message,
      });
      throw error;
    }

    // `(seriesId, sourceId, number)` también es único: dos Capítulos con el
    // mismo número romperían el upsert. El primero de la Fuente gana.
    const seen = new Set<number>();
    const valid = chapters.filter((chapter) => {
      if (chapter.number === null) {
        log({
          event: "chapter-skipped",
          reason: "number-null",
          seriesExternalId: link.externalId,
          externalId: chapter.externalId,
        });
        return false;
      }
      if (seen.has(chapter.number)) {
        log({
          event: "chapter-duplicate",
          seriesExternalId: link.externalId,
          externalId: chapter.externalId,
          number: chapter.number,
        });
        return false;
      }
      seen.add(chapter.number);
      return true;
    });

    // Detalle + Capítulos + marca en una transacción: un corte no deja la
    // fecha marcada sobre una lista a medias.
    await db.$transaction(async (tx) => {
      await tx.series.update({
        where: { id: serie.id },
        data: detailData(detail, detail),
      });
      // El número también es único por Serie y Fuente. Si otro segmento de URL
      // ya lo ocupa (la Fuente cambió el slug del Capítulo), ese registro se
      // reidentifica con el externalId vigente en vez de borrarse: borrarlo
      // arrastraría en cascada el Progreso y los Comentarios del Capítulo.
      const ocupados = await tx.chapter.findMany({
        where: { seriesId: serie.id, sourceId: link.sourceId },
        select: { id: true, externalId: true, number: true },
      });
      const porNumero = new Map(ocupados.map((c) => [c.number, c]));
      const vigentes = new Set(valid.map((c) => c.externalId));
      for (const chapter of valid) {
        const data = {
          number: chapter.number as number,
          title: chapter.title ?? null,
          publishedAt: chapter.publishedAt ?? null,
        };
        const ocupante = porNumero.get(chapter.number as number);
        if (
          ocupante &&
          ocupante.externalId !== chapter.externalId &&
          !vigentes.has(ocupante.externalId)
        ) {
          await tx.chapter.update({
            where: { id: ocupante.id },
            data: { externalId: chapter.externalId, ...data },
          });
          log({
            event: "chapter-reidentified",
            seriesExternalId: link.externalId,
            externalId: ocupante.externalId,
            nowExternalId: chapter.externalId,
            number: chapter.number,
          });
          continue;
        }
        await tx.chapter.upsert({
          where: {
            seriesId_sourceId_externalId: {
              seriesId: serie.id,
              sourceId: link.sourceId,
              externalId: chapter.externalId,
            },
          },
          create: { seriesId: serie.id, sourceId: link.sourceId, externalId: chapter.externalId, ...data },
          update: data,
        });
      }
      await tx.seriesSource.update({
        where: { id: link.id },
        data: { chaptersSyncedAt: new Date(), url: detail.url },
      });
    });
    log({ event: "series-synced", slug, externalId: link.externalId, chapters: valid.length });
  }
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
    // El adapter no reintenta un fallo de transporte: el spec deja ese
    // reintento al job. Olympus entrega los headers y luego tarda con el
    // cuerpo (#21: page=2 abortó a los 30 s leyendo), así que una página
    // intermitente se vuelve a pedir antes de rendirse.
    let page;
    for (let attempt = 0; ; attempt++) {
      try {
        page = await source.search("", cursor);
        break;
      } catch (error) {
        if (!(error instanceof SourceError)) throw error;
        if (attempt >= CATALOG_RETRIES || !RETRYABLE.has(error.kind)) {
          log({ event: "catalog-failed", kind: error.kind, message: error.message });
          throw error;
        }
        log({
          event: "catalog-retry",
          kind: error.kind,
          attempt: attempt + 1,
          message: error.message,
        });
        await sleep(CATALOG_RETRY_DELAY_MS * 2 ** attempt);
      }
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
