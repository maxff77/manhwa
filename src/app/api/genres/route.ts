import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

// ponytail: caché en memoria de proceso, 1 h. Sin Redis ni tabla de caché.
const TTL_MS = 60 * 60 * 1000;
let cache: { genres: string[]; expiresAt: number } | null = null;

export async function GET() {
  if (!cache || cache.expiresAt <= Date.now()) {
    const rows = await prisma.$queryRaw<Array<{ genre: string }>>`
      SELECT DISTINCT unnest("genres") AS genre FROM "series" ORDER BY genre ASC
    `;
    cache = { genres: rows.map((row) => row.genre), expiresAt: Date.now() + TTL_MS };
  }

  return NextResponse.json(
    { genres: cache.genres },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
