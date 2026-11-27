import type { PrismaClient } from "../generated/prisma/client";
import { SourceError, type SourceAdapter } from "../sources/types";

export interface PageSyncDeps {
  db: PrismaClient;
  source: SourceAdapter;
  log: (event: Record<string, unknown>) => void;
}

/**
 * Sincronización al abrir un Capítulo (#24): cada apertura pide
 * `getChapterPages` y reemplaza el conjunto por posición (upsert + borrado de
 * las posiciones sobrantes). Un fallo del adapter no toca la DB: si ya hay
 * Páginas persistidas se sirven las existentes y se registra el error; si no
 * hay ninguna, se propaga para que la API responda 502 (v1.md).
 */
export async function syncChapterPages(
  deps: PageSyncDeps,
  seriesExternalId: string,
  chapterId: string,
  chapterExternalId: string,
): Promise<void> {
  const { db, source, log } = deps;
  let pages;
  try {
    pages = await source.getChapterPages(seriesExternalId, chapterExternalId);
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    const persisted = await db.page.count({ where: { chapterId } });
    log({
      event: "pages-sync-failed",
      chapterId,
      externalId: chapterExternalId,
      kind: error.kind,
      message: error.message,
      persisted,
    });
    if (persisted > 0) return;
    throw error;
  }
  // Reemplazo por posición en una transacción: un corte no deja el conjunto a
  // medias. La identidad es `(chapterId, position)` (image-pipeline.md).
  await db.$transaction(async (tx) => {
    for (const page of pages) {
      await tx.page.upsert({
        where: { chapterId_position: { chapterId, position: page.position } },
        create: { chapterId, position: page.position, sourceUrl: page.url },
        update: { sourceUrl: page.url },
      });
    }
    await tx.page.deleteMany({
      where: { chapterId, position: { gte: pages.length } },
    });
  });
  log({ event: "pages-synced", chapterId, externalId: chapterExternalId, pages: pages.length });
}