import { expect, test } from "@playwright/test";

import {
  SOURCE_USER_AGENT,
  createSourceHttp,
  parseSourceBody,
  sourceFetch,
} from "../../src/sources/http";
import { expectSourceError } from "./suite";

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
    },
  };
}

/** Sustituye el fetch global durante el test y lo restaura aunque el test falle. */
async function withFetch(
  stub: (url: string, init: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
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

  await expectSourceError(sourceFetch(URL_SERIE, t.http), "BLOCKED");
  expect(t.calls).toHaveLength(3);
  expect(t.delays).toHaveLength(2);
  expect(t.delays[1]).toBeGreaterThan(t.delays[0]);
});

test("el delay base del backoff es configurable por Fuente", async () => {
  const t = transport([status(403)]);

  await expectSourceError(sourceFetch(URL_SERIE, { ...t.http, delayMs: 1_000 }), "BLOCKED");
  expect(t.delays[0]).toBeGreaterThanOrEqual(1_000);
});

test("429 agotado lanza RATE_LIMITED", async () => {
  const t = transport([status(429)]);

  await expectSourceError(sourceFetch(URL_SERIE, t.http), "RATE_LIMITED");
  expect(t.calls).toHaveLength(3);
});

test("5xx agotado lanza UPSTREAM", async () => {
  const t = transport([status(503)]);

  await expectSourceError(sourceFetch(URL_SERIE, t.http), "UPSTREAM");
  expect(t.calls).toHaveLength(3);
});

test("404 lanza NOT_FOUND sin reintentar", async () => {
  const t = transport([status(404)]);

  await expectSourceError(sourceFetch(URL_SERIE, t.http), "NOT_FOUND");
  expect(t.calls).toHaveLength(1);
  expect(t.delays).toEqual([]);
});

test("un fallo de transporte lanza UPSTREAM sin reintentar: el reintento es del job", async () => {
  const t = transport([ok]);
  const http = {
    ...t.http,
    fetch: async (_url: string, init: RequestInit) => {
      t.calls.push(init);

      throw new Error("sin red");
    },
  };

  await expectSourceError(sourceFetch(URL_SERIE, http), "UPSTREAM");
  expect(t.calls).toHaveLength(1);
  expect(t.delays).toEqual([]);
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

  await expectSourceError(parseSourceBody(response, parseRoto), "PARSE");
});

test("el transporte por defecto aplica timeout y UA de bot", async () => {
  const inits: RequestInit[] = [];

  await withFetch(
    async (_url, init) => {
      inits.push(init);

      return ok();
    },
    async () => {
      const response = await sourceFetch(URL_SERIE, createSourceHttp(TRAP_HOST));

      expect(response.status).toBe(200);
      expect(inits[0]?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(inits[0]?.headers).get("User-Agent")).toBe(SOURCE_USER_AGENT);
    },
  );
});

test("el timeout aborta la petición de verdad y lanza UPSTREAM", async () => {
  let abortado = false;
  let intentos = 0;

  await withFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        intentos += 1;
        init.signal?.addEventListener("abort", () => {
          abortado = true;
          reject(new Error("timeout"));
        });
      }),
    async () => {
      await expectSourceError(
        sourceFetch(URL_SERIE, createSourceHttp(TRAP_HOST, 1, 30)),
        "UPSTREAM",
      );
    },
  );

  expect(abortado).toBe(true);
  expect(intentos).toBe(1);
});

test("el transporte por defecto deja una petición en vuelo por host", async () => {
  let enVuelo = 0;
  let maxEnVuelo = 0;

  await withFetch(
    async () => {
      enVuelo += 1;
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
      await new Promise((resolve) => setTimeout(resolve, 5));
      enVuelo -= 1;

      return ok();
    },
    async () => {
      const http = createSourceHttp(TRAP_HOST, 1);

      await Promise.all([sourceFetch(URL_SERIE, http), sourceFetch(URL_SERIE, http)]);
    },
  );

  expect(maxEnVuelo).toBe(1);
});

test("un 200 con Location al host trampa no es un bloqueo", async () => {
  const t = transport([
    () => new Response("cuerpo", { status: 200, headers: { location: `https://${TRAP_HOST}/x` } }),
  ]);

  const response = await sourceFetch(URL_SERIE, t.http);

  expect(response.status).toBe(200);
  expect(t.calls).toHaveLength(1);
});

test("el transporte por defecto espacia las peticiones al mismo host con delayMs", async () => {
  const inicios: number[] = [];

  await withFetch(
    async () => {
      inicios.push(Date.now());

      return ok();
    },
    async () => {
      const http = createSourceHttp(TRAP_HOST, 80);

      await Promise.all([sourceFetch(URL_SERIE, http), sourceFetch(URL_SERIE, http)]);
    },
  );

  expect(inicios).toHaveLength(2);
  expect(inicios[1] - inicios[0]).toBeGreaterThanOrEqual(70);
});
