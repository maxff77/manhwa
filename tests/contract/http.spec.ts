import { expect, test } from "@playwright/test";

import {
  SOURCE_USER_AGENT,
  createSourceHttp,
  parseSourceBody,
  sourceFetch,
} from "../../src/sources/http";
import { SourceError } from "../../src/sources/types";

const URL_SERIE = "https://fuente.example/series/academia";
const TRAP_HOST = "trampa.example";

const ok = () => new Response("cuerpo", { status: 200 });
const status = (code: number) => () => new Response(null, { status: code });
const trap = () =>
  new Response(null, { status: 302, headers: { location: `https://${TRAP_HOST}/bloqueo` } });

/** Transporte falso: respuestas en cola. Ningún test abre la red. */
function transport(replies: Array<() => Response>) {
  const calls: RequestInit[] = [];
  const delays: number[] = [];
  let attempt = 0;

  return {
    calls,
    delays,
    http: {
      trapHost: TRAP_HOST,
      delayMs: 500,
      fetch: async (_url: string, init: RequestInit) => {
        calls.push(init);
        const reply = replies[Math.min(attempt, replies.length - 1)];
        attempt += 1;

        return reply();
      },
      sleep: async (ms: number) => {
        delays.push(ms);
      },
      random: () => 0.5,
    },
  };
}

test("302 al host trampa seguido de 200 reintenta y tiene éxito", async () => {
  const t = transport([trap, ok]);

  const response = await sourceFetch(URL_SERIE, t.http);

  expect(response.status).toBe(200);
  expect(t.calls).toHaveLength(2);
  expect(t.delays).toHaveLength(1);
});

test("403 persistente lanza BLOCKED tras 3 intentos con backoff creciente", async () => {
  const t = transport([status(403)]);

  await expect(sourceFetch(URL_SERIE, t.http)).rejects.toMatchObject({
    name: "SourceError",
    kind: "BLOCKED",
  });
  expect(t.calls).toHaveLength(3);
  expect(t.delays).toHaveLength(2);
  expect(t.delays[1]).toBeGreaterThan(t.delays[0]);
});

test("el delay base del backoff es configurable por Fuente", async () => {
  const t = transport([status(403)]);

  await expect(sourceFetch(URL_SERIE, { ...t.http, delayMs: 1_000 })).rejects.toMatchObject({
    kind: "BLOCKED",
  });
  expect(t.delays[0]).toBeGreaterThanOrEqual(1_000);
});

test("429 agotado lanza RATE_LIMITED", async () => {
  const t = transport([status(429)]);

  await expect(sourceFetch(URL_SERIE, t.http)).rejects.toMatchObject({ kind: "RATE_LIMITED" });
  expect(t.calls).toHaveLength(3);
});

test("5xx agotado lanza UPSTREAM", async () => {
  const t = transport([status(503)]);

  await expect(sourceFetch(URL_SERIE, t.http)).rejects.toMatchObject({ kind: "UPSTREAM" });
  expect(t.calls).toHaveLength(3);
});

test("404 lanza NOT_FOUND sin reintentar", async () => {
  const t = transport([status(404)]);

  await expect(sourceFetch(URL_SERIE, t.http)).rejects.toMatchObject({ kind: "NOT_FOUND" });
  expect(t.calls).toHaveLength(1);
  expect(t.delays).toEqual([]);
});

test("un fallo de transporte agotado lanza UPSTREAM", async () => {
  const t = transport([ok]);
  const http = {
    ...t.http,
    fetch: async () => {
      throw new Error("timeout");
    },
  };

  await expect(sourceFetch(URL_SERIE, http)).rejects.toMatchObject({ kind: "UPSTREAM" });
});

test("cada petición lleva el User-Agent de bot propio", async () => {
  const t = transport([ok]);

  await sourceFetch(URL_SERIE, t.http);

  expect(new Headers(t.calls[0].headers).get("User-Agent")).toBe(SOURCE_USER_AGENT);
});

test("parseSourceBody devuelve el resultado del parseo", async () => {
  const response = new Response('{"items":[1]}', { status: 200 });

  expect(await parseSourceBody(response, (body) => JSON.parse(body))).toEqual({ items: [1] });
});

test("un parseo roto lanza PARSE y nunca devuelve una lista parcial", async () => {
  const response = new Response("<html>roto", { status: 200 });
  const parseRoto = () => {
    throw new SyntaxError("HTML roto");
  };

  await expect(parseSourceBody(response, parseRoto)).rejects.toBeInstanceOf(SourceError);
  await expect(parseSourceBody(response, parseRoto)).rejects.toMatchObject({ kind: "PARSE" });
});

test("el transporte por defecto aplica timeout y UA de bot", async () => {
  const original = globalThis.fetch;
  const inits: RequestInit[] = [];

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    inits.push(init);

    return ok();
  }) as unknown as typeof fetch;

  try {
    const response = await sourceFetch(URL_SERIE, createSourceHttp(TRAP_HOST));

    expect(response.status).toBe(200);
    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(inits[0]?.headers).get("User-Agent")).toBe(SOURCE_USER_AGENT);
  } finally {
    globalThis.fetch = original;
  }
});

test("el transporte por defecto deja una petición en vuelo por host", async () => {
  const original = globalThis.fetch;
  let enVuelo = 0;
  let maxEnVuelo = 0;

  globalThis.fetch = (async () => {
    enVuelo += 1;
    maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await new Promise((resolve) => setTimeout(resolve, 5));
    enVuelo -= 1;

    return ok();
  }) as unknown as typeof fetch;

  try {
    const http = createSourceHttp(TRAP_HOST);

    await Promise.all([sourceFetch(URL_SERIE, http), sourceFetch(URL_SERIE, http)]);

    expect(maxEnVuelo).toBe(1);
  } finally {
    globalThis.fetch = original;
  }
});
