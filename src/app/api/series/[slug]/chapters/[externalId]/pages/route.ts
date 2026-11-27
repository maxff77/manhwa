import { NextResponse } from "next/server";
import { syncChapterPages } from "@/ingest/pages";
import { prisma } from "@/lib/db";
import { getSourceAdapter } from "@/sources/registry";
import { SourceError } from "@/sources/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; externalId: string }> };

/**
 * Manifiesto de Páginas del lector (#24, v1.md). Cada apertura sincroniza el
 * conjunto por posición; un fallo del adapter sirve lo persistido y solo
 * responde 502 si no hay ninguna Página. `url` es opaca para el lector.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug, externalId } = await params;
  const serie = await prisma.series.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      sources: { include: { source: { select: { id: true, slug: true } } } },
    },
  });
  if (!serie) {
    return NextResponse.json({ error: "Serie inexistente" }, { status: 404 });
  }
  const source = getSourceAdapter();
  const link = serie.sources.find((v) => v.source.slug === source.slug);
  if (!link) {
    return NextResponse.json({ error: "Serie sin vínculo a la Fuente activa" }, { status: 404 });
  }
  const chapter = await prisma.chapter.findUnique({
    where: {
      seriesId_sourceId_externalId: {
        seriesId: serie.id,
        sourceId: link.sourceId,
        externalId,
      },
    },
    select: { id: true, number: true, title: true, publishedAt: true },
  });
  if (!chapter) {
    return NextResponse.json({ error: "Capítulo inexistente" }, { status: 404 });
  }

  try {
    await syncChapterPages(
      { db: prisma, source, log: (event) => console.log(JSON.stringify(event)) },
      link.externalId,
      chapter.id,
      externalId,
    );
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    return NextResponse.json({ error: "La Fuente no entregó las Páginas" }, { status: 502 });
  }

  const pages = await prisma.page.findMany({
    where: { chapterId: chapter.id },
    orderBy: { position: "asc" },
    select: { id: true, position: true, sourceUrl: true },
  });
  // Lista completa para el selector del lector; los vecinos salen de ella
  // (misma Serie y Fuente: identidad completa).
  const chapters = await prisma.chapter.findMany({
    where: { seriesId: serie.id, sourceId: link.sourceId },
    orderBy: { number: "asc" },
    select: { externalId: true, number: true },
  });
  const at = chapters.findIndex((c) => c.externalId === externalId);
  const prev = chapters[at - 1] ?? null;
  const next = chapters[at + 1] ?? null;

  return NextResponse.json(
    {
      series: { id: serie.id, slug: serie.slug, title: serie.title },
      chapter: {
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
        publishedAt: chapter.publishedAt,
      },
      pages: pages.map((page) => ({ id: page.id, position: page.position, url: page.sourceUrl })),
      prevChapter: prev,
      nextChapter: next,
      chapters,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}