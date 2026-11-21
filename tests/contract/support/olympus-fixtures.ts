import type { SourceHttp } from "../../../src/sources/http";

/** Host trampa medido en #12: Olympus redirige ahí cuando bloquea. */
export const OLYMPUS_TRAP_HOST = "zonaolympus.9thclassresult2026.com";

const BASE = "https://olympusxyz.com";
const MEDIA = "https://media.imagesolymp.xyz/comics";

interface CatalogItem {
  id: number;
  name: string;
  slug: string;
  cover?: string;
  type: string;
  summary?: string;
  status?: { id: number; name: string };
  genres?: Array<{ id: number; name: string }>;
}

// Formas de payload según #13/#14 y los clientes públicos (Keiyoushi/Msopla).
// El slug de API no lleva prefijo de tipo; el slug de página añade `comic-`.
const academia: CatalogItem = {
  id: 11,
  name: "Academia de la Ascensión",
  slug: "academia-de-la-ascension-20261114-080134843",
  cover: `${MEDIA}/covers/11/tmpedu9scno-lg.webp`,
  type: "comic",
  summary: "Una academia de magia.",
  status: { id: 1, name: "Activo" },
  genres: [
    { id: 1, name: "Acción" },
    { id: 2, name: "Fantasía" },
  ],
};
const bruma: CatalogItem = {
  id: 12,
  name: "Bruma del Norte",
  slug: "bruma-del-norte-20261114-080200000",
  type: "comic",
};
const ceniza: CatalogItem = {
  id: 13,
  name: "Ceniza y Oro",
  slug: "ceniza-y-oro-20261114-080300000",
  type: "comic",
};
const larga: CatalogItem = {
  id: 14,
  name: "La Serie Larga",
  slug: "la-serie-larga-20261114-080400000",
  type: "comic",
};
const novela: CatalogItem = {
  id: 15,
  name: "Novela Academia Oculta",
  slug: "novela-academia-oculta-20261114-080500000",
  type: "novel",
};

const catalogItems = [academia, bruma, ceniza, larga];

/** `/api/series?page=N`: envoltura data.series + recommended_series que se ignora. */
function catalogPage(items: CatalogItem[], currentPage: number, lastPage: number) {
  return {
    data: {
      series: {
        current_page: currentPage,
        last_page: lastPage,
        per_page: 15,
        total: catalogItems.length,
        data: items,
      },
      recommended_series: { data: [ceniza] },
    },
  };
}

interface ChapterItem {
  id: number;
  name: string;
  published_at: string | null;
  team?: { id: number; name: string };
}

const chapter = (id: number, name: string, day: string): ChapterItem => ({
  id,
  name,
  published_at: `2026-01-${day}T00:00:00.000000Z`,
  team: { id: 1, name: "Olympus " },
});

const academiaChapters: ChapterItem[] = [
  chapter(101, "1", "01"),
  // Nombre no parseable como número: el contrato exige number null.
  chapter(102, "extra", "02"),
  chapter(103, "3", "03"),
  // Número duplicado con segmento propio: se devuelve tal cual.
  chapter(104, "3-bis", "04"),
];

const largaChapters: ChapterItem[] = Array.from({ length: 45 }, (_, i) =>
  chapter(200 + i, String(i + 1), "01"),
);

/** `meta.total` es el total de la Serie en todas las páginas, no el del trozo. */
function chaptersPayload(
  items: ChapterItem[],
  currentPage: number,
  lastPage: number,
  total: number,
) {
  return {
    data: items,
    meta: { current_page: currentPage, last_page: lastPage, per_page: 40, total },
  };
}

/**
 * `/api/capitulo/<slug>/<segmento>?type=comic`: las Páginas vienen como URLs en
 * `chapter.pages`. El HTML del lector queda fuera: el smoke contra producción
 * lo vio bloqueado (302 al host trampa) mientras la API respondía.
 */
function chapterPayload(urls: string[]) {
  return { chapter: { pages: urls } };
}

const chapterPagesJson: Record<string, unknown> = {
  [`/api/capitulo/${academia.slug}/1?type=comic`]: chapterPayload([
    `${MEDIA}/academia/1/1_01.webp`,
    `${MEDIA}/academia/1/1_02.webp`,
  ]),
  [`/api/capitulo/${academia.slug}/extra?type=comic`]: chapterPayload([]),
  // Sin `chapter.pages`: el adapter debe lanzar PARSE, no devolver [].
  [`/api/capitulo/${academia.slug}/3?type=comic`]: { error: true },
};

/** Rutas JSON/HTML que sirve el transporte falso, con la forma real de Olympus. */
export function olympusResponses(): Map<string, unknown> {
  const responses = new Map<string, unknown>();

  responses.set("/api/series?page=1", catalogPage([academia, bruma], 1, 2));
  responses.set("/api/series?page=2", catalogPage([ceniza], 2, 2));
  // El catálogo completo incluye novelas: el adapter filtra type === "comic".
  responses.set("/api/series/list", { data: [...catalogItems, novela] });

  responses.set(`/api/series/${academia.slug}?type=comic`, { data: academia });
  responses.set(`/api/series/${bruma.slug}?type=comic`, { data: bruma });

  const asc = (slug: string, page: number) =>
    `/api/series/${slug}/chapters?page=${page}&direction=asc&type=comic`;
  const desc = (slug: string, page: number) =>
    `/api/series/${slug}/chapters?page=${page}&direction=desc&type=comic`;

  responses.set(asc(academia.slug, 1), chaptersPayload(academiaChapters, 1, 1, 4));
  responses.set(
    desc(academia.slug, 1),
    chaptersPayload([...academiaChapters].reverse(), 1, 1, 4),
  );

  // Serie sin Capítulos: la API responde 200 con una página vacía.
  // Una Serie que no existe responde 404 y eso es NOT_FOUND, no una página vacía.
  const empty = { data: [], meta: { current_page: 1, last_page: 1, per_page: 40, total: 0 } };
  responses.set("/api/series/sin-capitulos/chapters?page=1&direction=asc&type=comic", empty);
  responses.set("/api/series/sin-capitulos/chapters?page=1&direction=desc&type=comic", empty);

  const largaDesc = [...largaChapters].reverse();
  responses.set(asc(larga.slug, 1), chaptersPayload(largaChapters.slice(0, 40), 1, 2, 45));
  responses.set(asc(larga.slug, 2), chaptersPayload(largaChapters.slice(40), 2, 2, 45));
  responses.set(desc(larga.slug, 1), chaptersPayload(largaDesc.slice(0, 40), 1, 2, 45));
  responses.set(desc(larga.slug, 2), chaptersPayload(largaDesc.slice(40), 2, 2, 45));

  for (const [path, payload] of Object.entries(chapterPagesJson)) {
    responses.set(path, payload);
  }

  return responses;
}

/** Identidades externas de las fixtures: un solo sitio donde viven los slugs. */
export const olympusIds = {
  academia: `comic-${academia.slug}`,
  larga: `comic-${larga.slug}`,
};

/** Slug de la página 2 de Capítulos de la Serie larga, para mutar esa fixture. */
export const largaChaptersPage2Path = `/api/series/${larga.slug}/chapters?page=2&direction=asc&type=comic`;

/** Respuesta con un status dado, sin cuerpo. */
export const statusReply = (code: number) => () => new Response(null, { status: code });

/** 302 a un host trampa: el bloqueo medido en #12. */
export const trapReplyTo = (host: string) => () =>
  new Response(null, { status: 302, headers: { location: `https://${host}/bloqueo` } });

/** URLs absolutas de las fixtures, para afirmar qué se pidió y qué no. */
export const olympusUrls = {
  catalogPage1: `${BASE}/api/series?page=1`,
  catalogList: `${BASE}/api/series/list`,
  academiaDetail: `${BASE}/api/series/${academia.slug}?type=comic`,
  academiaChaptersAsc1: `${BASE}/api/series/${academia.slug}/chapters?page=1&direction=asc&type=comic`,
  academiaChapter1: `${BASE}/api/capitulo/${academia.slug}/1?type=comic`,
};

export interface FixtureTransport {
  http: SourceHttp;
  /** URLs pedidas, en orden, para afirmar caché y ausencia de red extra. */
  calls: string[];
  /** Inserta una respuesta antes de las fixtures (p. ej. un 302 al host trampa). */
  queueReply: (url: string, reply: () => Response) => void;
}

/**
 * Transporte de fixtures: sirve las respuestas grabadas sin abrir la red.
 * Una ruta desconocida es 404, igual que el sitio; un 404 inesperado hace
 * fallar el test en vez de devolver datos inventados.
 */
export function fixtureTransport(responses: Map<string, unknown>): FixtureTransport {
  const calls: string[] = [];
  const queues = new Map<string, Array<() => Response>>();

  return {
    calls,
    queueReply: (url, reply) => {
      const queue = queues.get(url) ?? [];
      queue.push(reply);
      queues.set(url, queue);
    },
    http: {
      trapHost: OLYMPUS_TRAP_HOST,
      delayMs: 1,
      fetch: async (url) => {
        calls.push(url);

        const queued = queues.get(url)?.shift();
        if (queued) {
          return queued();
        }

        const { pathname, search } = new URL(url);
        const body = responses.get(pathname + search);

        if (body === undefined) {
          return new Response(null, { status: 404 });
        }

        return typeof body === "string"
          ? new Response(body, { status: 200, headers: { "content-type": "text/html" } })
          : Response.json(body);
      },
      sleep: async () => {},
    },
  };
}
