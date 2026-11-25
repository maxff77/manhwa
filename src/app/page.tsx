import { Card, Link } from "@heroui/react";

import { ThemeToggle } from "@/components/theme-toggle";
import { prisma } from "@/lib/db";

// Render por petición: sin esto Next prerenderiza la home en el build con la
// base del build (.env) y sirve ese HTML aunque el runtime apunte a otra base
// (medido: la home mostraba Series de desarrollo con la base de test vacía).
export const dynamic = "force-dynamic";

type LatestRow = {
  slug: string;
  title: string;
  coverUrl: string | null;
  status: string;
  latestNumber: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  ONGOING: "En emisión",
  COMPLETED: "Completada",
  HIATUS: "En pausa",
  CANCELLED: "Cancelada",
};

async function loadLatest(): Promise<LatestRow[]> {
  // ponytail: MAX(publishedAt) por Serie vía SQL crudo; Prisma no ordena por agregado.
  return prisma.$queryRaw<LatestRow[]>`
    SELECT s."slug", s."title", s."coverSourceUrl" AS "coverUrl", s."status"::text AS "status",
           c."number" AS "latestNumber"
    FROM "series" s
    LEFT JOIN LATERAL (
      SELECT MAX(ch."publishedAt") AS "maxPublishedAt" FROM "chapters" ch WHERE ch."seriesId" = s."id"
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT ch."number" FROM "chapters" ch
      WHERE ch."seriesId" = s."id"
      ORDER BY ch."publishedAt" DESC NULLS LAST, ch."number" DESC
      LIMIT 1
    ) c ON true
    ORDER BY m."maxPublishedAt" DESC NULLS LAST, s."titleNormalized" ASC, s."id" ASC
    LIMIT 20
  `;
}

// ponytail: caché de datos por proceso con TTL de 60 s (catalog.md), solo para
// las secciones públicas sin filtros. Una vista filtrada por género se resuelve
// por petición: es una navegación distinta, no la home cacheada.
// Descartado medido: ISR (`revalidate`) hornea el HTML del build con la base del
// build y lo sirve aunque el runtime apunte a otra; `unstable_cache` persiste en
// disco entre corridas. Esta caché muere con el proceso.
// La entrada guarda la huella del Catálogo (Series + último Capítulo): si cambia,
// se descarta antes del TTL. Sin ella un test que siembra tras otro veía la lista
// del anterior, y en producción un Capítulo nuevo tardaría hasta 60 s de más.
const HOME_TTL_MS = 60_000;
let latestCache: { latest: LatestRow[]; fingerprint: string; expiresAt: number } | null = null;

/** Huella barata del estado del Catálogo: cuántas Series y cuál es el último Capítulo. */
async function catalogFingerprint(): Promise<string> {
  const [row] = await prisma.$queryRaw<Array<{ series: bigint; chapters: bigint; newest: Date | null }>>`
    SELECT (SELECT count(*) FROM "series") AS series,
           (SELECT count(*) FROM "chapters") AS chapters,
           (SELECT MAX("publishedAt") FROM "chapters") AS newest
  `;
  return `${row.series}:${row.chapters}:${row.newest?.getTime() ?? 0}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = [params.genre ?? []].flat().filter(Boolean);

  if (selected.length > 0) {
    // La rejilla de géneros se muestra también en la vista filtrada: se pide
    // siempre, no depende de una visita previa a la home.
    const [filtered, genreRows] = await Promise.all([
      loadFiltered(selected),
      prisma.$queryRaw<Array<{ genre: string }>>`
        SELECT DISTINCT unnest("genres") AS genre FROM "series" ORDER BY genre ASC
      `,
    ]);
    return renderHome(
      filtered,
      genreRows.map((row) => row.genre),
      selected,
    );
  }

  // ponytail: la caché guarda solo «Últimos capítulos». Los géneros se piden por
  // petición: son una consulta de microsegundos y así la rejilla nunca queda
  // congelada con los géneros de otra pasada (medido: un test sembraba Romance y
  // la home seguía mostrando solo Acción).
  const genreRows = await prisma.$queryRaw<Array<{ genre: string }>>`
    SELECT DISTINCT unnest("genres") AS genre FROM "series" ORDER BY genre ASC
  `;
  const genres = genreRows.map((row) => row.genre);

  const fingerprint = await catalogFingerprint();
  if (
    !latestCache ||
    latestCache.expiresAt <= Date.now() ||
    latestCache.fingerprint !== fingerprint
  ) {
    const latest = await loadLatest();
    latestCache =
      latest.length === 0
        ? null
        : { latest, fingerprint, expiresAt: Date.now() + HOME_TTL_MS };
    return renderHome(latest, genres, []);
  }
  return renderHome(latestCache.latest, genres, []);
}

async function loadFiltered(genres: string[]): Promise<LatestRow[]> {
  return prisma.$queryRaw<LatestRow[]>`
    SELECT s."slug", s."title", s."coverSourceUrl" AS "coverUrl", s."status"::text AS "status",
           c."number" AS "latestNumber"
    FROM "series" s
    LEFT JOIN LATERAL (
      SELECT ch."number" FROM "chapters" ch
      WHERE ch."seriesId" = s."id"
      ORDER BY ch."publishedAt" DESC NULLS LAST, ch."number" DESC
      LIMIT 1
    ) c ON true
    WHERE s."genres" && ${genres}::text[]
    ORDER BY s."titleNormalized" ASC, s."id" ASC
    LIMIT 50
  `;
}

function renderHome(latest: LatestRow[], genres: string[], selected: string[]) {
  const filtered = selected.length > 0;
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-surface focus:text-foreground focus:shadow-overlay"
      >
        Saltar al contenido
      </a>

      <header className="border-b border-separator">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            Manhwa
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main id="contenido" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
        <section aria-labelledby="catalog-title" className="flex flex-col gap-6">
          <div className="flex max-w-prose flex-col gap-1">
            <h1 id="catalog-title" className="text-3xl font-semibold tracking-tight">
              Catálogo
            </h1>
            <p className="text-muted">Series de manhwa para leer en vertical, sin instalar nada.</p>
          </div>

          {latest.length === 0 ? (
            <Card className="max-w-xl">
              <Card.Header>
                <h2 className="text-sm leading-6 font-medium text-foreground">
                  {filtered ? "Ninguna Serie con ese género" : "El Catálogo está vacío"}
                </h2>
                <Card.Description>Vuelve pronto para descubrir Series.</Card.Description>
              </Card.Header>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Últimos capítulos</h2>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {latest.map((serie) => (
                  <li key={serie.slug}>
                    <Link
                      href={`/series/${serie.slug}`}
                      className="flex h-full flex-col gap-2 rounded-lg bg-surface p-3 no-underline shadow-surface"
                    >
                      {serie.coverUrl ? (
                        <img
                          alt=""
                          src={serie.coverUrl}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="aspect-[2/3] w-full rounded-md object-cover"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="aspect-[2/3] w-full rounded-md bg-surface-secondary"
                        />
                      )}
                      <span className="text-sm font-medium text-foreground">{serie.title}</span>
                      <span className="text-xs text-muted">
                        {STATUS_LABEL[serie.status] ?? serie.status}
                      </span>
                      <span className="text-xs text-muted">
                        {serie.latestNumber === null
                          ? "Sin Capítulos"
                          : `Capítulo ${serie.latestNumber}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="genres-title" className="flex flex-col gap-4">
          <h2 id="genres-title" className="text-xl font-semibold tracking-tight">
            Géneros
          </h2>
          {genres.length === 0 ? (
            <p className="text-muted">Todavía no hay géneros en el Catálogo.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {genres.map((genre) => (
                <li key={genre}>
                  <Link
                    href={`/?genre=${encodeURIComponent(genre)}`}
                    className="rounded-md bg-default px-3 py-1.5 text-sm text-default-foreground no-underline"
                  >
                    {genre}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
