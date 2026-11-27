import { Card, Chip } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { SiteHeader } from "@/components/site-header";
import { Synopsis } from "@/components/synopsis";
import { syncSeries } from "@/ingest/catalog";
import { prisma } from "@/lib/db";
import { STATUS_LABEL, chapterNumber, genreLabel, timeAgo } from "@/lib/format";
import { getSourceAdapter } from "@/sources/registry";
import { SourceError } from "@/sources/types";

// Por petición: la sincronización al visitar depende de `chaptersSyncedAt` y
// del reloj, no del build (mismo criterio que la home).
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const serie = await prisma.series.findUnique({
    where: { slug },
    select: { title: true, synopsis: true, coverSourceUrl: true },
  });
  if (!serie) return {};
  // La portada viaja en la vista previa al compartir el enlace.
  return {
    title: serie.title,
    description: serie.synopsis?.slice(0, 160),
    openGraph: serie.coverSourceUrl ? { images: [serie.coverSourceUrl] } : undefined,
  };
}

export default async function SeriesPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ orden?: string }> }) {
  const { slug } = await params;
  const oldestFirst = (await searchParams).orden === "antiguos";

  const existe = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
  if (!existe) notFound();

  // Sincronizar antes de renderizar (v1.md). Un fallo del adapter conserva lo
  // persistido: syncSeries registra y lanza sin tocar nada; aquí se sirve lo
  // que ya hay, nunca una lista parcial.
  try {
    await syncSeries(
      { db: prisma, source: getSourceAdapter(), log: (event) => console.log(JSON.stringify(event)) },
      slug,
    );
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
  }

  const serie = await prisma.series.findUniqueOrThrow({
    where: { slug },
    include: { chapters: { orderBy: { number: "asc" } } },
  });

  const now = Date.now();
  const chapters = serie.chapters;
  const first = chapters[0];
  const last = chapters.at(-1);
  const latestAt = chapters.reduce<Date | null>(
    (max, c) => (c.publishedAt && (!max || c.publishedAt > max) ? c.publishedAt : max),
    null,
  );
  const updated = latestAt ? timeAgo(latestAt, now) : "";
  const chapterHref = (externalId: string) => `/series/${serie.slug}/capitulo/${externalId}`;
  const longTitle = serie.title.length > 60;
  const hasAside = Boolean(serie.synopsis) || serie.authors.length > 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader back={{ href: "/", label: "Catálogo" }} />

      <main id="contenido" className="flex flex-1 flex-col">
        {/* La cabecera vive siempre en el tema oscuro: el color lo pone la portada,
            enorme y desenfocada detrás; el velo garantiza el contraste del texto. */}
        <section
          aria-labelledby="serie-title"
          className="dark relative isolate overflow-hidden bg-background text-foreground"
        >
          {serie.coverSourceUrl ? (
            <img
              alt=""
              src={serie.coverSourceUrl}
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 -z-20 size-full scale-125 object-cover blur-2xl saturate-150 motion-safe:animate-[cover-wash_1100ms_cubic-bezier(0.16,1,0.3,1)_both]"
            />
          ) : null}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-linear-to-b from-background/55 via-background/70 via-70% to-background/95"
          />

          <div className="mx-auto grid w-full max-w-6xl grid-cols-[7.25rem_minmax(0,1fr)] items-end gap-x-4 gap-y-5 px-4 pt-6 pb-7 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-6 sm:px-6 sm:pt-10 sm:pb-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-[1fr_auto_auto] lg:gap-x-10 lg:gap-y-6 lg:py-14">
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-tertiary shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)] lg:row-span-3">
              {serie.coverSourceUrl ? (
                <img
                  alt={`Portada de ${serie.title}`}
                  src={serie.coverSourceUrl}
                  decoding="async"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid size-full place-items-center text-5xl font-semibold text-muted"
                >
                  {serie.title.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0) || "?"}
                </span>
              )}
            </div>

            <div className="col-start-2 row-start-1 flex flex-col gap-2 self-end">
              <h1
                id="serie-title"
                className={`font-semibold tracking-tight text-balance ${
                  longTitle
                    ? "text-xl leading-snug sm:text-2xl lg:text-4xl lg:leading-tight"
                    : "text-2xl leading-tight sm:text-3xl lg:text-[2.5rem] lg:leading-[1.08]"
                }`}
              >
                {serie.title}
              </h1>
              <p className="text-sm text-foreground/85 tabular-nums sm:text-[0.9375rem]">
                {STATUS_LABEL[serie.status] ?? serie.status}
                {" · "}
                {chapters.length === 0 ? "Sin Capítulos" : capitulos(chapters.length)}
                {latestAt ? (
                  <>
                    {/* timeAgo da «hace 3 días» o, pasado un mes, la fecha («7 abr 2023»): esa lleva «el». */}
                    {/^\d/.test(updated) ? " · actualizada el " : " · actualizada "}
                    <time dateTime={latestAt.toISOString()}>{updated}</time>
                  </>
                ) : null}
              </p>
            </div>

            {first && last ? (
              <div className="col-span-2 grid grid-cols-2 gap-2 lg:col-span-1 lg:col-start-2 lg:flex lg:gap-3">
                <NextLink
                  href={chapterHref(first.externalId)}
                  className={buttonVariants({
                    size: "lg",
                    fullWidth: true,
                    className: `lg:w-auto lg:px-6 ${first === last ? "col-span-2" : ""}`,
                  })}
                >
                  Empezar a leer
                </NextLink>
                {first !== last ? (
                  <NextLink
                    href={chapterHref(last.externalId)}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "lg",
                      fullWidth: true,
                      // Translúcido sobre la portada: el gris sólido de `secondary` la tapaba.
                      className:
                        "text-foreground tabular-nums [--button-bg:color-mix(in_oklab,var(--foreground)_16%,transparent)] [--button-bg-hover:color-mix(in_oklab,var(--foreground)_26%,transparent)] lg:w-auto lg:px-6",
                    })}
                  >
                    {/* Un solo nodo: el botón es flex con gap y separaría cada trozo. */}
                    <span>
                      Último: <span aria-hidden="true">Cap.</span>
                      <span className="sr-only">Capítulo</span> {chapterNumber.format(last.number)}
                    </span>
                  </NextLink>
                ) : null}
              </div>
            ) : null}

            {serie.genres.length > 0 ? (
              <ul
                aria-label="Géneros"
                className="col-span-2 flex flex-wrap gap-1.5 lg:col-span-1 lg:col-start-2"
              >
                {serie.genres.map((genre) => (
                  <li key={genre}>
                    <Chip size="sm" className="rounded-md bg-foreground/15 text-foreground">
                      {genreLabel(genre)}
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <div
          className={`mx-auto grid w-full max-w-6xl gap-8 px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:gap-12 lg:pt-12 ${
            hasAside ? "lg:grid-cols-[18rem_minmax(0,1fr)]" : ""
          }`}
        >
          {hasAside ? (
            <section aria-labelledby="sinopsis-title" className="flex flex-col gap-3">
              <h2
                id="sinopsis-title"
                className="sr-only text-xl font-semibold tracking-tight lg:not-sr-only"
              >
                Sinopsis
              </h2>
              {serie.synopsis ? (
                <Synopsis text={serie.synopsis} long={serie.synopsis.length > 240} />
              ) : null}
              {serie.authors.length > 0 ? (
                <p className="text-sm text-muted">Por {serie.authors.join(", ")}</p>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="capitulos-title" className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 id="capitulos-title" className="text-xl font-semibold tracking-tight">
                Capítulos{" "}
                <span className="text-sm font-normal text-muted tabular-nums">{chapters.length}</span>
              </h2>
              {chapters.length > 1 ? <SortToggle slug={serie.slug} oldestFirst={oldestFirst} /> : null}
            </div>

            {chapters.length === 0 ? (
              <Card className="max-w-xl">
                <Card.Header>
                  <h3 className="text-sm leading-6 font-medium text-foreground">Sin Capítulos</h3>
                  <Card.Description>La Fuente aún no expone Capítulos de esta Serie.</Card.Description>
                </Card.Header>
              </Card>
            ) : (
              <ol aria-label="Capítulos" className="flex flex-col gap-7">
                {calendar(chapters, oldestFirst).map((month, i, months) => {
                  const gap = pause(months[i - 1]?.index, month.index);
                  const headingId = `mes-${month.index ?? "sin-fecha"}`;
                  return (
                    <Fragment key={headingId}>
                      {gap ? (
                        <li className="flex items-center gap-3 text-xs text-muted">
                          <span aria-hidden="true" className="h-px flex-1 border-t border-dashed border-border" />
                          Sin Capítulos: {gap}
                          <span aria-hidden="true" className="h-px flex-1 border-t border-dashed border-border" />
                        </li>
                      ) : null}
                      <li className="flex flex-col gap-2.5">
                        <div className="flex items-baseline gap-2">
                          <h3 id={headingId} className="text-sm font-semibold">
                            {month.label}
                          </h3>
                          <p className="text-xs text-muted tabular-nums">{capitulos(month.chapters.length)}</p>
                        </div>
                        <ul
                          aria-labelledby={headingId}
                          className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2 lg:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]"
                        >
                          {month.chapters.map((chapter) => {
                            const isNew =
                              chapter.publishedAt !== null &&
                              now - chapter.publishedAt.getTime() < NEW_MS;
                            return (
                              <li key={chapter.id}>
                                <NextLink
                                  href={chapterHref(chapter.externalId)}
                                  data-testid={`capitulo-${chapter.externalId}`}
                                  className={`flex h-16 flex-col justify-between rounded-lg px-3 py-2.5 tabular-nums outline-none transition-colors duration-150 focus-visible:status-focused ${
                                    isNew
                                      ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                                      : "bg-surface text-surface-foreground shadow-surface hover:bg-surface-secondary"
                                  }`}
                                >
                                  <span className="text-lg leading-none font-semibold tracking-tight">
                                    <span className="sr-only">Capítulo </span>
                                    {chapterNumber.format(chapter.number)}
                                  </span>
                                  {/* «Nuevo» ocupa la línea de la fecha: la casilla mide lo
                                      mismo que las demás y la fila del mes no se rompe. */}
                                  <span className={`text-xs ${isNew ? "font-medium" : "text-muted"}`}>
                                    {isNew ? "Nuevo" : null}
                                    {chapter.publishedAt ? (
                                      <time
                                        dateTime={chapter.publishedAt.toISOString()}
                                        className={isNew ? "sr-only" : undefined}
                                      >
                                        {isNew ? ", " : null}
                                        {dayMonth.format(chapter.publishedAt)}
                                      </time>
                                    ) : (
                                      "Sin fecha"
                                    )}
                                  </span>
                                </NextLink>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/** Dos enlaces con aspecto de ToggleButtonGroup: el orden vive en la URL y funciona sin JS. */
function SortToggle({ slug, oldestFirst }: { slug: string; oldestFirst: boolean }) {
  const options = [
    { label: "Recientes", href: `/series/${slug}`, selected: !oldestFirst },
    { label: "Antiguos", href: `/series/${slug}?orden=antiguos`, selected: oldestFirst },
  ];
  // Seleccionado en el acento (DESIGN.md: selección = acento). El `accent-soft` de
  // HeroUI quedaba a 1,3:1 del otro segmento en claro e invisible en oscuro.
  return (
    <nav aria-label="Orden de los Capítulos" className="toggle-button-group toggle-button-group--horizontal">
      {options.map((option) => (
        <NextLink
          key={option.label}
          href={option.href}
          scroll={false}
          replace
          aria-current={option.selected ? "true" : undefined}
          data-selected={option.selected}
          className={`toggle-button toggle-button--sm ${
            option.selected ? "bg-accent text-accent-foreground hover:bg-accent-hover" : ""
          }`}
        >
          {option.label}
          <span className="sr-only"> primero</span>
        </NextLink>
      ))}
    </nav>
  );
}

const NEW_MS = 7 * 24 * 60 * 60_000;
const monthYear = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" });
const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

/** «1 Capítulo», «35 Capítulos»: el singular del GLOSSARY. */
function capitulos(n: number): string {
  return n === 1 ? "1 Capítulo" : `${n} Capítulos`;
}

type ChapterRow = { id: string; externalId: string; number: number; publishedAt: Date | null };
type Month = { index: number | null; label: string; chapters: ChapterRow[] };

/** Mes absoluto (año × 12 + mes) en la zona del servidor, la misma con la que se formatea. */
const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth();
const monthDate = (index: number) => new Date(Math.floor(index / 12), index % 12);

/**
 * Capítulos agrupados por el mes en que salieron. Meses y Capítulos van en el
 * mismo sentido; los que no tienen fecha cierran la lista en ambos órdenes.
 */
function calendar(chapters: ChapterRow[], oldestFirst: boolean): Month[] {
  const dir = oldestFirst ? 1 : -1;
  const groups = new Map<number | null, ChapterRow[]>();
  for (const chapter of chapters) {
    const key = chapter.publishedAt ? monthIndex(chapter.publishedAt) : null;
    const group = groups.get(key);
    if (group) group.push(chapter);
    else groups.set(key, [chapter]);
  }
  return [...groups]
    .map(([index, list]) => ({
      index,
      label: index === null ? "Sin fecha" : capitalize(monthYear.format(monthDate(index))),
      chapters: list.sort((a, b) => (a.number - b.number) * dir),
    }))
    .sort((a, b) =>
      a.index === null ? 1 : b.index === null ? -1 : (a.index - b.index) * dir,
    );
}

/** Los meses vacíos entre dos grupos con fecha: «junio–agosto de 2026». */
function pause(prev: number | null | undefined, next: number | null): string | null {
  if (prev == null || next === null) return null;
  const from = Math.min(prev, next) + 1;
  const to = Math.max(prev, next) - 1;
  if (to < from) return null;
  return from === to
    ? monthYear.format(monthDate(from))
    : monthYear.formatRange(monthDate(from), monthDate(to));
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}
