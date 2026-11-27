import { Card, Chip } from "@heroui/react";
import NextLink from "next/link";
import { notFound } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { syncSeries } from "@/ingest/catalog";
import { prisma } from "@/lib/db";
import { STATUS_LABEL, chapterNumber, genreLabel, shortDate } from "@/lib/format";
import { getSourceAdapter } from "@/sources/registry";
import { SourceError } from "@/sources/types";

// Por petición: la sincronización al visitar depende de `chaptersSyncedAt` y
// del reloj, no del build (mismo criterio que la home).
export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

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
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-8 pb-16 sm:px-6 sm:pt-10"
      >
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-lg bg-surface-tertiary sm:w-48">
            {serie.coverSourceUrl ? (
              <img
                alt=""
                src={serie.coverSourceUrl}
                decoding="async"
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

          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">{serie.title}</h1>
            <p className="text-sm text-muted">{STATUS_LABEL[serie.status] ?? serie.status}</p>
            {serie.genres.length > 0 ? (
              <ul aria-label="Géneros" className="flex flex-wrap gap-2">
                {serie.genres.map((genre) => (
                  <li key={genre}>
                    <Chip variant="soft" size="sm">
                      {genreLabel(genre)}
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : null}
            {serie.authors.length > 0 ? (
              <p className="text-sm text-muted">{serie.authors.join(", ")}</p>
            ) : null}
            {serie.synopsis ? (
              <p className="max-w-prose text-sm leading-relaxed">{serie.synopsis}</p>
            ) : null}
          </div>
        </div>

        <section aria-labelledby="capitulos-title" className="flex flex-col gap-3">
          <h2 id="capitulos-title" className="text-xl font-semibold tracking-tight">
            Capítulos{" "}
            <span className="text-sm font-normal text-muted tabular-nums">
              ({serie.chapters.length})
            </span>
          </h2>
          {serie.chapters.length === 0 ? (
            <Card className="max-w-xl">
              <Card.Header>
                <h3 className="text-sm leading-6 font-medium text-foreground">Sin Capítulos</h3>
                <Card.Description>La Fuente aún no expone Capítulos de esta Serie.</Card.Description>
              </Card.Header>
            </Card>
          ) : (
            <ul aria-label="Capítulos" className="flex flex-col divide-y divide-separator rounded-lg border border-separator">
              {serie.chapters.map((chapter) => (
                <li key={chapter.id}>
                  <NextLink
                    href={`/series/${serie.slug}/capitulo/${chapter.externalId}`}
                    data-testid={`capitulo-${chapter.externalId}`}
                    className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm outline-none hover:bg-surface-secondary focus-visible:status-focused"
                  >
                    <span className="font-medium tabular-nums">
                      Capítulo {chapterNumber.format(chapter.number)}
                      {chapter.title ? (
                        <span className="font-normal text-muted"> · {chapter.title}</span>
                      ) : null}
                    </span>
                    {chapter.publishedAt ? (
                      <time dateTime={chapter.publishedAt.toISOString()} className="shrink-0 text-xs text-muted">
                        {shortDate.format(chapter.publishedAt)}
                      </time>
                    ) : null}
                  </NextLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
