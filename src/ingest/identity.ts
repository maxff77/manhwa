import type { PrismaClient } from "../generated/prisma/client";

export interface IdentityMigrationDeps {
  db: PrismaClient;
  log: (event: Record<string, unknown>) => void;
}

/**
 * El sufijo `-YYYYMMDD-HHMMSSmmm` que el mirror de Olympus regenera a diario
 * no es identidad (#21). Con él en `SeriesSource.externalId`, cada pasada del
 * backfill creaba una Serie nueva para la misma obra.
 */
const MIRROR_SUFFIX = /-\d{8}-\d{9}$/;

function stableExternalId(externalId: string): string {
  return externalId.replace(MIRROR_SUFFIX, "");
}

/**
 * Deja la identidad estable en los vínculos ya ingeridos y fusiona los
 * duplicados que el sufijo produjo.
 *
 * Conserva la Serie más reciente (`updatedAt`), que es la que la última pasada
 * refrescó. Una Serie con datos de Usuario (Seguimiento, Progreso, Colección o
 * Comentario) NO se borra: la cascada se llevaría esos datos, así que se omite
 * con log para revisión humana. Reejecutar no cambia nada.
 */
export async function migrateSeriesIdentity(
  deps: IdentityMigrationDeps,
): Promise<{ renamed: number; merged: number; skipped: number }> {
  const { db, log } = deps;
  let renamed = 0;
  let merged = 0;
  let skipped = 0;

  const links = await db.seriesSource.findMany({
    select: {
      id: true,
      externalId: true,
      seriesId: true,
      sourceId: true,
      series: {
        select: {
          updatedAt: true,
          _count: {
            select: { follows: true, progress: true, collections: true, comments: true },
          },
        },
      },
    },
    orderBy: { externalId: "asc" },
  });

  // Agrupar por (Fuente, identidad estable): los duplicados son los que solo
  // se distinguían por el sufijo del día.
  const groups = new Map<string, typeof links>();
  for (const link of links) {
    const key = `${link.sourceId}:${stableExternalId(link.externalId)}`;
    const group = groups.get(key) ?? [];
    group.push(link);
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    const stable = key.slice(key.indexOf(":") + 1);
    // La más reciente gana: es la que la última pasada del Catálogo refrescó.
    const ordered = [...group].sort(
      (a, b) => b.series.updatedAt.getTime() - a.series.updatedAt.getTime(),
    );
    const keep = ordered[0];

    for (const stale of ordered.slice(1)) {
      const userData =
        stale.series._count.follows +
        stale.series._count.progress +
        stale.series._count.collections +
        stale.series._count.comments;

      if (userData > 0) {
        skipped++;
        log({
          event: "merge-skipped",
          externalId: stale.externalId,
          seriesId: stale.seriesId,
          reason: "user-data",
          ...stale.series._count,
        });
        continue;
      }

      // Borrar la Serie arrastra sus Capítulos y su vínculo (onDelete: Cascade).
      await db.series.delete({ where: { id: stale.seriesId } });
      merged++;
      log({
        event: "series-merged",
        externalId: stale.externalId,
        keptSeriesId: keep.seriesId,
        removedSeriesId: stale.seriesId,
      });
    }

    // El vínculo conservado pasa a la identidad estable. Si otro vínculo ya la
    // ocupa (una Serie omitida por datos de Usuario), se deja como está.
    if (keep.externalId !== stable) {
      const occupied = await db.seriesSource.findFirst({
        where: { sourceId: keep.sourceId, externalId: stable, id: { not: keep.id } },
        select: { id: true },
      });

      if (occupied) {
        skipped++;
        log({
          event: "rename-skipped",
          externalId: keep.externalId,
          stableExternalId: stable,
          reason: "identity-taken",
        });
        continue;
      }

      await db.seriesSource.update({
        where: { id: keep.id },
        data: { externalId: stable },
      });
      renamed++;
      log({ event: "identity-renamed", from: keep.externalId, to: stable });
    }
  }

  return { renamed, merged, skipped };
}
