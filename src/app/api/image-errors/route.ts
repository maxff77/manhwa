import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_ID_LENGTH = 200;
const MAX_URL_LENGTH = 2048;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

// ponytail: rate limit en memoria por IP/proceso; usar storage compartido si hay varias instancias.
const hits = new Map<string, { count: number; resetAt: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const hit = hits.get(ip);
  if (!hit || hit.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  hit.count += 1;
  return hit.count > MAX_PER_WINDOW;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function httpUrl(value: unknown): value is string {
  if (!validString(value, MAX_URL_LENGTH)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Beacon de errores de imagen (#24): valida forma/tamaño y solo deja una línea JSON. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "demasiados reportes" }, { status: 429 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload demasiado grande" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    !validString(body.pageId, MAX_ID_LENGTH) ||
    !validString(body.chapterId, MAX_ID_LENGTH) ||
    !httpUrl(body.url)
  ) {
    return NextResponse.json({ error: "forma inválida" }, { status: 400 });
  }

  console.log(
    JSON.stringify({
      event: "image-error",
      pageId: body.pageId,
      chapterId: body.chapterId,
      url: body.url,
      timestamp: new Date().toISOString(),
    }),
  );

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}