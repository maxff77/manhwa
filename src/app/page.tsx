import { Card, Chip } from "@heroui/react";
import { linkVariants } from "@heroui/styles";
import NextLink from "next/link";

import { GenreFilter } from "@/components/genre-filter";
import { Rail } from "@/components/rail";
import { ThemeToggle } from "@/components/theme-toggle";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { STATUS_LABEL, chapterNumber, genreLabel, timeAgo } from "@/lib/format";

// Render por petición: sin esto Next prerenderiza la home en el build con la
// base del build (.env) y sirve ese HTML aunque el runtime apunte a otra base
// (medido: la home mostraba Series de desarrollo con la base de test vacía).
export const dynamic = "force-dynamic";

type SeriesRow = {
  slug: string;
  title: string;
  coverUrl: string | null;
  status: string;
  latestNumber: number | null;
  latestAt: Date | null;
};

const LATEST_SIZE = 20;
const RAIL_SIZE = 12;
const RAIL_GENRES = 3;
const FILTER_LIMIT = 50;

/** Series ordenadas por su último Capítulo; `where` filtra sobre `s`. */
function loadSeries(where: Prisma.Sql, limit: number): Promise<SeriesRow[]> {
  // ponytail: el Capítulo más reciente por Serie vía LATERAL; Prisma no ordena por agregado.
  return prisma.$queryRaw<SeriesRow[]>`
    SELECT s."slug", s."title", s."coverSourceUrl" AS "coverUrl", s."status"::text AS "status",
           c."number" AS "latestNumber", c."publishedAt" AS "latestAt"
    FROM "series" s
    LEFT JOIN LATERAL (
      SELECT ch."number", ch."publishedAt" FROM "chapters" ch
      WHERE ch."seriesId" = s."id"
      ORDER BY ch."publishedAt" DESC NULLS LAST, ch."number" DESC
      LIMIT 1
    ) c ON true
    ${where}
    ORDER BY c."publishedAt" DESC NULLS LAST, s."titleNormalized" ASC, s."id" ASC
    LIMIT ${limit}
  `;
}

type Shelves = {
  latest: SeriesRow[];
  rails: Array<{ genre: string; items: SeriesRow[] }>;
};

/**
 * «Últimos capítulos» y un carril por cada género grande. Cada carril excluye
 * las Series ya mostradas: Acción cubre el 85 % del Catálogo y, sin esto, su
 * carril repetía casi entero el de «Últimos capítulos».
 */
async function loadShelves(genres: string[]): Promise<Shelves> {
  const latest = await loadSeries(Prisma.empty, LATEST_SIZE);
  const shown = latest.map((serie) => serie.slug);
  const rails: Shelves["rails"] = [];
  for (const genre of genres.slice(0, RAIL_GENRES)) {
    const items = await loadSeries(
      Prisma.sql`WHERE ${genre} = ANY(s."genres") AND s."slug" <> ALL(${shown}::text[])`,
      RAIL_SIZE,
    );
    shown.push(...items.map((serie) => serie.slug));
    if (items.length > 0) rails.push({ genre, items });
  }
  return { latest, rails };
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
let shelvesCache: { shelves: Shelves; fingerprint: string; expiresAt: number } | null = null;

/** Huella barata del estado del Catálogo; también da el total de Series. */
async function catalogStats() {
  const [row] = await prisma.$queryRaw<Array<{ series: bigint; chapters: bigint; newest: Date | null }>>`
    SELECT (SELECT count(*) FROM "series") AS series,
           (SELECT count(*) FROM "chapters") AS chapters,
           (SELECT MAX("publishedAt") FROM "chapters") AS newest
  `;
  return {
    total: Number(row.series),
    fingerprint: `${row.series}:${row.chapters}:${row.newest?.getTime() ?? 0}`,
  };
}

// ponytail: los géneros se piden por petición, sin caché: son una consulta de
// microsegundos y así nunca quedan congelados con los de otra pasada (medido: un
// test sembraba Romance y la home seguía mostrando solo Acción).
async function loadGenres(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ genre: string }>>`
    SELECT g AS genre FROM "series", unnest("genres") AS g
    GROUP BY g ORDER BY count(*) DESC, g ASC
  `;
  return rows.map((row) => row.genre);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = [...new Set([params.genre ?? []].flat().filter(Boolean))];
  const [genres, stats] = await Promise.all([loadGenres(), catalogStats()]);

  let content: React.ReactNode;
  let status = "";
  if (stats.total === 0) {
    content = (
      <div className="px-4 sm:px-6">
        <EmptyCard title="El Catálogo está vacío" description="Vuelve pronto para descubrir Series." />
      </div>
    );
  } else if (selected.length > 0) {
    const where = Prisma.sql`WHERE s."genres" && ${selected}::text[]`;
    const [items, [{ count }]] = await Promise.all([
      loadSeries(where, FILTER_LIMIT),
      prisma.$queryRaw<[{ count: bigint }]>`SELECT count(*) FROM "series" s ${where}`,
    ]);
    content = <Results selected={selected} items={items} total={Number(count)} />;
    status = `${seriesCount(Number(count))} de ${anyOf.format(selected.map(genreLabel))}`;
  } else {
    if (
      !shelvesCache ||
      shelvesCache.expiresAt <= Date.now() ||
      shelvesCache.fingerprint !== stats.fingerprint
    ) {
      shelvesCache = {
        shelves: await loadShelves(genres),
        fingerprint: stats.fingerprint,
        expiresAt: Date.now() + HOME_TTL_MS,
      };
    }
    content = <ShelvesView shelves={shelvesCache.shelves} />;
  }

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
          <NextLink href="/" className="text-lg font-semibold tracking-tight text-foreground">
            Manhwa
          </NextLink>
          <ThemeToggle />
        </div>
      </header>

      <main
        id="contenido"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 pt-8 pb-16 sm:pt-10"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4 px-4 sm:px-6">
            <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
            {stats.total > 0 ? (
              <p className="text-sm text-muted tabular-nums">{seriesCount(stats.total)}</p>
            ) : null}
          </div>
          {genres.length > 0 ? (
            <GenreFilter
              genres={genres.map((genre) => ({ id: genre, label: genreLabel(genre) }))}
              selected={selected}
            />
          ) : null}
          {/* Anuncia el resultado al filtrar (WCAG 4.1.3). Vive aquí, fuera del contenido
              que cambia: una región viva recién montada no se anuncia de forma fiable. */}
          <p role="status" className="sr-only">
            {status}
          </p>
        </div>

        {content}
      </main>
    </div>
  );
}

function ShelvesView({ shelves }: { shelves: Shelves }) {
  const now = Date.now();
  return (
    <>
      <Rail title="Últimos capítulos">
        {shelves.latest.map((serie, index) => (
          <li key={serie.slug} className="w-40 shrink-0 snap-start sm:w-48 lg:w-56">
            <SeriesItem serie={serie} now={now} eager={index < 3} />
          </li>
        ))}
      </Rail>
      {shelves.rails.map(({ genre, items }) => (
        <Rail
          key={genre}
          title={genreLabel(genre)}
          moreHref={`/?${new URLSearchParams({ genre })}`}
        >
          {items.map((serie) => (
            <li key={serie.slug} className="w-36 shrink-0 snap-start sm:w-40">
              <SeriesItem serie={serie} now={now} />
            </li>
          ))}
        </Rail>
      ))}
    </>
  );
}

const anyOf = new Intl.ListFormat("es", { type: "disjunction" });
const link = linkVariants();

function Results({
  selected,
  items,
  total,
}: {
  selected: string[];
  items: SeriesRow[];
  total: number;
}) {
  const now = Date.now();
  return (
    <section aria-labelledby="results-title" className="flex flex-col gap-5 px-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <h2 id="results-title" className="text-xl font-semibold tracking-tight text-balance">
            {anyOf.format(selected.map(genreLabel))}
          </h2>
          <p className="text-sm text-muted tabular-nums">
            {seriesCount(total)}
            {total > items.length ? ` · las ${items.length} con Capítulo más reciente` : null}
          </p>
        </div>
        <NextLink href="/" className={link.base({ className: "text-sm underline underline-offset-4" })}>
          Quitar filtros
        </NextLink>
      </div>

      {items.length === 0 ? (
        <EmptyCard
          level={3}
          title="Ninguna Serie con ese género"
          description="Prueba con otro género o quita los filtros."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-6">
          {items.map((serie, index) => (
            <li key={serie.slug}>
              <SeriesItem serie={serie} now={now} eager={index < 4} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyCard({
  title,
  description,
  level = 2,
}: {
  title: string;
  description: string;
  level?: 2 | 3;
}) {
  // Encabezado plano del nivel que toca: Card.Title impone h3 y su `render` no
  // funciona desde un server component. Dentro de los resultados cuelga de su h2.
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Card className="max-w-xl">
      <Card.Header>
        <Heading className="text-sm leading-6 font-medium text-foreground">{title}</Heading>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
    </Card>
  );
}

function SeriesItem({ serie, now, eager = false }: { serie: SeriesRow; now: number; eager?: boolean }) {
  const chapter =
    serie.latestNumber === null ? null : `Capítulo ${chapterNumber.format(serie.latestNumber)}`;
  return (
    <NextLink
      href={`/series/${serie.slug}`}
      className="group flex flex-col gap-2 rounded-lg text-foreground no-underline outline-none focus-visible:status-focused"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-tertiary">
        {serie.coverUrl ? (
          <img
            alt=""
            src={serie.coverUrl}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-full place-items-center text-5xl font-semibold text-muted"
          >
            {serie.title.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0) || "?"}
          </span>
        )}
        {chapter ? (
          <Chip
            aria-hidden="true"
            color="accent"
            variant="primary"
            size="sm"
            className="absolute bottom-2 left-2 rounded-md tabular-nums"
          >
            {chapter}
          </Chip>
        ) : null}
      </div>
      {/* Dos líneas reservadas: la línea de estado queda alineada en todo el carril. */}
      <span className="line-clamp-2 min-h-[2lh] text-sm leading-snug font-medium group-hover:underline group-hover:underline-offset-2">
        {serie.title}
      </span>
      <span className="text-xs text-muted">
        {chapter ? <span className="sr-only">{chapter}, </span> : null}
        {STATUS_LABEL[serie.status] ?? serie.status}
        {" · "}
        {chapter === null ? (
          "Sin Capítulos"
        ) : serie.latestAt ? (
          <time dateTime={serie.latestAt.toISOString()}>{timeAgo(serie.latestAt, now)}</time>
        ) : (
          "Sin fecha"
        )}
      </span>
    </NextLink>
  );
}

/** «1 Serie», «896 Series»: el singular del GLOSSARY. */
function seriesCount(total: number): string {
  return total === 1 ? "1 Serie" : `${total} Series`;
}
