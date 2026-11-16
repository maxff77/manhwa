import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const series = await prisma.series.findMany({
    orderBy: [{ titleNormalized: "asc" }, { id: "asc" }],
    take: 20,
    include: {
      chapters: {
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { number: "desc" }],
        take: 1,
        select: { number: true, publishedAt: true },
      },
    },
  });

  return NextResponse.json({
    items: series.map((item) => {
      const latestChapter = item.chapters[0];

      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        coverUrl: item.coverSourceUrl,
        status: item.status,
        type: item.type,
        latestChapter: latestChapter
          ? { number: latestChapter.number, publishedAt: latestChapter.publishedAt }
          : null,
      };
    }),
    nextCursor: null,
  });
}
