import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeTitle } from "@/lib/normalize";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json({ error: "limit fuera de 1..50" }, { status: 400 });
  }

  // ponytail: cursor = offset + huella de los valores normalizados; keyset si la deriva molesta.
  // La huella ignora el orden y los duplicados de los parámetros repetidos (catalog.md).
  const normalizedParams = new URLSearchParams();
  normalizedParams.set("limit", String(limit));
  normalizedParams.set("q", normalizeTitle(params.get("q") ?? ""));
  normalizedParams.set("sort", params.get("sort") ?? "title");
  for (const genre of [...new Set(params.getAll("genre"))].sort()) {
    normalizedParams.append("genre", genre);
  }
  for (const status of [...new Set(params.getAll("status"))].sort()) {
    normalizedParams.append("status", status);
  }
  const fingerprint = [...normalizedParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  let offset = 0;
  const cursor = params.get("cursor");
  if (cursor !== null) {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^(\d+)\|([\s\S]*)$/.exec(decoded);
    if (!match || match[2] !== fingerprint) {
      return NextResponse.json({ error: "cursor inválido" }, { status: 400 });
    }
    offset = Number(match[1]);
  }

  // OR dentro del mismo filtro, AND entre filtros distintos (catalog.md).
  const genres = params.getAll("genre");
  const allowedStatuses = ["ongoing", "completed", "hiatus", "cancelled"];
  const rawStatuses = params.getAll("status");
  if (rawStatuses.some((value) => !allowedStatuses.includes(value))) {
    return NextResponse.json({ error: "status desconocido" }, { status: 400 });
  }
  const statuses = rawStatuses.map((value) => value.toUpperCase());

  // q con términos manda la relevancia de search.md; sort explícito ahí → 400.
  const terms = normalizeTitle(params.get("q") ?? "").split(" ").filter(Boolean);
  const rawSort = params.get("sort");
  if (terms.length > 0 && rawSort !== null) {
    return NextResponse.json({ error: "sort no aplica en modo búsqueda" }, { status: 400 });
  }
  const sort = rawSort ?? "title";
  if (sort !== "title" && sort !== "latest") {
    return NextResponse.json({ error: "sort desconocido" }, { status: 400 });
  }

  // ponytail: MAX(publishedAt) por Serie vía SQL crudo; Prisma no ordena por agregado.
  // El cursor sigue siendo offset + huella: la deriva con Capítulos nuevos está aceptada en v1.
  if (sort === "latest") {
    const where: string[] = [];
    const values: unknown[] = [];
    if (genres.length > 0) {
      values.push(genres);
      where.push(`s."genres" && $${values.length}::text[]`);
    }
    if (statuses.length > 0) {
      values.push(statuses);
      where.push(`s."status"::text = ANY($${values.length}::text[])`);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    values.push(limit + 1, offset);
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        slug: string;
        title: string;
        coverUrl: string | null;
        status: string;
        type: string;
        latestNumber: number | null;
        latestPublishedAt: Date | null;
      }>
    >(
      `SELECT s."id", s."slug", s."title", s."coverSourceUrl" AS "coverUrl",
              s."status"::text AS "status", s."type"::text AS "type",
              c."number" AS "latestNumber", c."publishedAt" AS "latestPublishedAt"
       FROM "series" s
       LEFT JOIN LATERAL (
         SELECT MAX(ch."publishedAt") AS "maxPublishedAt" FROM "chapters" ch WHERE ch."seriesId" = s."id"
       ) m ON true
       LEFT JOIN LATERAL (
         SELECT ch."number", ch."publishedAt" FROM "chapters" ch
         WHERE ch."seriesId" = s."id"
         ORDER BY ch."publishedAt" DESC NULLS LAST, ch."number" DESC
         LIMIT 1
       ) c ON true
       ${clause}
       ORDER BY m."maxPublishedAt" DESC NULLS LAST, s."titleNormalized" ASC, s."id" ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      ...values,
    );

    const hasMoreLatest = rows.length > limit;
    const pageLatest = hasMoreLatest ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      items: pageLatest.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        coverUrl: row.coverUrl,
        status: row.status,
        type: row.type,
        latestChapter:
          row.latestNumber === null
            ? null
            : { number: row.latestNumber, publishedAt: row.latestPublishedAt },
      })),
      nextCursor: hasMoreLatest
        ? Buffer.from(`${offset + limit}|${fingerprint}`, "utf8").toString("base64url")
        : null,
    });
  }

  const series = await prisma.series.findMany({
    where: {
      ...(genres.length > 0 ? { genres: { hasSome: genres } } : {}),
      ...(statuses.length > 0
        ? { status: { in: statuses as Array<"ONGOING" | "COMPLETED" | "HIATUS" | "CANCELLED"> } }
        : {}),
    },
    orderBy: [{ titleNormalized: "asc" }, { id: "asc" }],
    skip: offset,
    take: limit + 1,
    include: {
      chapters: {
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { number: "desc" }],
        take: 1,
        select: { number: true, publishedAt: true },
      },
    },
  });

  const hasMore = series.length > limit;
  const page = hasMore ? series.slice(0, limit) : series;

  return NextResponse.json({
    items: page.map((item) => {
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
    nextCursor: hasMore
      ? Buffer.from(`${offset + limit}|${fingerprint}`, "utf8").toString("base64url")
      : null,
  });
}
