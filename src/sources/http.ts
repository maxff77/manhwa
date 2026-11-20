import { SourceError, type SourceErrorKind } from "./types";

/** UA de bot propio de la plataforma; nunca de navegador ni de crawler de IA. */
export const SOURCE_USER_AGENT = "ManhwaBot/1.0";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 15_000;

/** Transporte inyectable: la suite de contrato lo sustituye sin abrir la red. */
export interface SourceHttp {
  /** Host al que la Fuente manda cuando bloquea. */
  trapHost: string;
  /** Delay entre peticiones al mismo host y base del backoff; cada Fuente lo ajusta. */
  delayMs: number;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
}

/**
 * Una petición en vuelo por host, espaciada `delayMs`: la cola vive en esta
 * instancia de transporte. `timeoutMs` es ajustable para que el test de contrato
 * compruebe el abort real sin esperar el timeout de producción.
 */
export function createSourceHttp(
  trapHost: string,
  delayMs = BASE_DELAY_MS,
  timeoutMs = TIMEOUT_MS,
): SourceHttp {
  const colas = new Map<string, Promise<unknown>>();
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  return {
    trapHost,
    delayMs,
    fetch: (url, init) => {
      const host = new URL(url).hostname;
      const previo = colas.get(host);
      const turno = (previo ?? Promise.resolve())
        .then(() => (previo ? sleep(delayMs) : undefined))
        .then(() => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }));

      // La cola avanza aunque la petición falle; el error lo ve quien la pidió.
      colas.set(host, turno.catch(() => {}));

      return turno;
    },
    sleep,
  };
}

/** El host trampa se ve en el Location de un 3xx o en la URL final si se siguió. */
function isTrap(response: Response, url: string, trapHost: string): boolean {
  const redirige = response.status >= 300 && response.status < 400;
  const target = (redirige ? response.headers.get("location") : null) ?? response.url;

  if (!target) {
    return false;
  }

  try {
    return new URL(target, url).hostname === trapHost;
  } catch {
    return false;
  }
}

function errorKindOf(response: Response): SourceErrorKind {
  if (response.status === 404) return "NOT_FOUND";
  if (response.status === 403) return "BLOCKED";
  if (response.status === 429) return "RATE_LIMITED";

  return "UPSTREAM";
}

/**
 * Política HTTP de la Fuente: UA propio, hasta 3 intentos con backoff exponencial
 * + jitter ante bloqueo, 429 y 5xx, y `SourceError` tipado al rendirse.
 */
export async function sourceFetch(url: string, http: SourceHttp): Promise<Response> {
  let kind: SourceErrorKind = "UPSTREAM";
  let cause: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await http.sleep(http.delayMs * 2 ** (attempt - 1) + Math.random() * http.delayMs);
    }

    let response: Response;

    try {
      response = await http.fetch(url, { headers: { "User-Agent": SOURCE_USER_AGENT } });
    } catch (error) {
      // Timeout o fallo de red: el spec no lo lista entre los reintentos del
      // adapter; el reintento es del job.
      throw new SourceError("UPSTREAM", `La Fuente falló (UPSTREAM): ${url}`, error);
    }

    if (isTrap(response, url, http.trapHost)) {
      kind = "BLOCKED";
      cause = response.status;
      continue;
    }

    if (response.ok) {
      return response;
    }

    kind = errorKindOf(response);
    cause = response.status;

    if (kind === "NOT_FOUND") {
      break;
    }
  }

  throw new SourceError(kind, `La Fuente falló (${kind}): ${url}`, cause);
}

/** Parsea el cuerpo entero; cualquier fallo es `PARSE`, nunca una lista parcial. */
export async function parseSourceBody<T>(
  response: Response,
  parse: (body: string) => T,
): Promise<T> {
  try {
    return parse(await response.text());
  } catch (cause) {
    throw new SourceError("PARSE", `Respuesta inesperada de la Fuente: ${response.url}`, cause);
  }
}
