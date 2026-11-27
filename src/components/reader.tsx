"use client";

import { Button, Drawer, Spinner } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { chapterNumber } from "@/lib/format";

interface ManifestPage {
  id: string;
  position: number;
  url: string;
}
interface ChapterRef {
  externalId: string;
  number: number;
}
interface Manifest {
  series: { id: string; slug: string; title: string };
  chapter: { id: string; number: number; title: string | null; publishedAt: string | null };
  pages: ManifestPage[];
  prevChapter: ChapterRef | null;
  nextChapter: ChapterRef | null;
  chapters: ChapterRef[];
}

const BACK = "m15 18-6-6 6-6";
const FORWARD = "m9 18 6-6-6-6";
const GRID = "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z";

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d={d} />
    </svg>
  );
}

/** Centra el Capítulo actual en la lista sin mover la ventana (scrollIntoView movería el lector). */
function centerInList(el: HTMLElement | null) {
  const box = el?.closest<HTMLElement>(".drawer__body");
  if (el && box) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
}

/** Ventana B aprobada en el prototipo (#5): [actual-2, actual+5] con src. */
const AHEAD = 5;
const BEHIND = 2;
/** Olympus no expone dimensiones (v1.md): ratio por defecto hasta cargar. */
const DEFAULT_RATIO = 720 / 1800;

/**
 * Estado local del lector en IndexedDB (v1.md): dimensiones naturales por
 * Página y posición exacta de lectura por Capítulo. La posición vive aquí, no
 * en localStorage: el Progreso offline (#32) leerá esta misma base.
 */
function openReaderDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open("manhwa-reader", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("dims")) db.createObjectStore("dims");
      if (!db.objectStoreNames.contains("pos")) db.createObjectStore("pos");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/** Lectura de una clave; `undefined` si no hay base o no hay valor. */
function idbGet<T>(db: IDBDatabase | null, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const req = db.transaction(store).objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function idbPut(db: IDBDatabase | null, store: string, key: string, value: unknown) {
  if (!db) return;
  try {
    db.transaction(store, "readwrite").objectStore(store).put(value, key);
  } catch {
    // Cuota o cierre de la base: el dato se pierde, la lectura sigue.
  }
}

async function readDims(db: IDBDatabase | null, ids: string[]) {
  const entries = await Promise.all(
    ids.map(async (id) => [id, await idbGet<number>(db, "dims", id)] as const),
  );
  return Object.fromEntries(entries.filter(([, ratio]) => typeof ratio === "number")) as Record<
    string,
    number
  >;
}

/** Cada error de imagen sale por beacon: log estructurado, sin tabla (image-pipeline.md). */
function beacon(pageId: string, chapterId: string, url: string) {
  try {
    navigator.sendBeacon(
      "/api/image-errors",
      new Blob([JSON.stringify({ pageId, chapterId, url })], { type: "application/json" }),
    );
  } catch {
    // sendBeacon puede fallar por tamaño; el placeholder ya cubre al lector.
  }
}

export function Reader({ slug, externalId }: { slug: string; externalId: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  /**
   * Por Página: `tries` 0 = original, 1 = cache-buster, 2+ = placeholder;
   * `bust` sube con cada «Reintentar» manual para que la URL cambie de verdad
   * (con el mismo `retry=1` el navegador no volvía a pedirla).
   */
  const [attempts, setAttempts] = useState<Record<string, { tries: number; bust: number }>>({});
  const figures = useRef<Array<HTMLElement | null>>([]);
  const readerDb = useRef<IDBDatabase | null>(null);
  /** Mientras se restaura la posición no se guarda nada: ver el efecto de scroll. */
  const restoring = useRef(true);
  /** Barras visibles: se ocultan al bajar leyendo y vuelven al subir, al tocar o al llegar a un extremo. */
  const [chrome, setChrome] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    let alive = true;
    // Al cambiar de Capítulo el shell se reutiliza: se limpia el estado del
    // anterior para no mostrar sus Páginas ni su posición mientras carga.
    // El array de figuras también: si conserva los nodos desmontados del
    // Capítulo anterior, `offsetTop` vale 0 y la búsqueda binaria cree que
    // todas las Páginas están en la cima (la ventana nunca avanza).
    figures.current = [];
    setManifest(null);
    setFailed(false);
    setCurrent(0);
    setAttempts({});
    setChrome(true);
    setListOpen(false);
    window.scrollTo(0, 0);
    fetch(`/api/series/${slug}/chapters/${encodeURIComponent(externalId)}/pages`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Manifest>;
      })
      .then(async (data) => {
        if (!alive) return;
        readerDb.current = await openReaderDb();
        const saved = await readDims(readerDb.current, data.pages.map((p) => p.id));
        if (!alive) return;
        setRatios(saved);
        setManifest(data);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [slug, externalId]);

  const pages = manifest?.pages ?? [];

  /** Página bajo el borde superior del viewport; búsqueda binaria sobre offsets. */
  const indexAt = useCallback(
    (y: number) => {
      let lo = 0;
      let hi = pages.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const el = figures.current[mid];
        if (el && el.offsetTop <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    },
    [pages.length],
  );

  useEffect(() => {
    if (!manifest || pages.length === 0) return;
    const chapterId = manifest.chapter.id;
    let ticking = false;
    // Restauración por Página + offset dentro de ella (prototipo B). Hasta que
    // termina no se guarda nada: el scroll del arranque pisaría la posición
    // previa con la cima antes de haberla leído.
    restoring.current = true;
    void idbGet<{ page: number; off: number }>(readerDb.current, "pos", chapterId).then((saved) => {
      requestAnimationFrame(() => {
        const fig = saved ? figures.current[saved.page] : null;
        if (fig) window.scrollTo(0, fig.offsetTop + (saved!.off || 0));
        // El salto de la restauración no cuenta como «bajar leyendo».
        lastY.current = window.scrollY;
        setCurrent(indexAt(window.scrollY));
        restoring.current = false;
      });
    });
    const save = () => {
      if (restoring.current) return;
      const page = indexAt(window.scrollY);
      const off = Math.max(0, window.scrollY - (figures.current[page]?.offsetTop ?? 0));
      idbPut(readerDb.current, "pos", chapterId, { page, off });
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        const dy = y - lastY.current;
        lastY.current = y;
        const atEdge = y < 80 || y + window.innerHeight > document.documentElement.scrollHeight - 240;
        if (atEdge || dy < -6) setChrome(true);
        else if (dy > 6) setChrome(false);
        setCurrent(indexAt(y));
        // Se guarda en el mismo frame que actualiza el contador: con un
        // throttle de 300 ms una recarga inmediata perdía la última Página.
        save();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", save);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", save);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [manifest, indexAt]);

  if (failed) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted">No se pudo cargar el Capítulo.</p>
          <NextLink href={`/series/${slug}`} className="text-sm font-medium underline underline-offset-4">
            Volver a la Serie
          </NextLink>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-label="Cargando Capítulo">
        <Spinner size="lg" />
      </div>
    );
  }

  const chapterHref = (ref: ChapterRef) => `/series/${slug}/capitulo/${ref.externalId}`;
  const onError = (p: ManifestPage) => {
    beacon(p.id, manifest.chapter.id, p.url);
    setAttempts((prev) => ({ ...prev, [p.id]: { tries: (prev[p.id]?.tries ?? 0) + 1, bust: prev[p.id]?.bust ?? 0 } }));
  };

  const { prevChapter, nextChapter, chapters } = manifest;
  const number = chapterNumber.format(manifest.chapter.number);
  const seriesHref = `/series/${slug}`;
  const step = "max-sm:w-12 max-sm:px-0";
  const bar = "z-20 border-separator bg-background/90 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none";

  return (
    <div className="min-h-dvh bg-background">
      <header
        onFocus={() => setChrome(true)}
        className={`sticky top-0 border-b ${bar} ${chrome ? "" : "-translate-y-full"}`}
      >
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-1 px-2">
          <NextLink
            href={seriesHref}
            aria-label="Volver a la Serie"
            className={buttonVariants({ variant: "ghost", size: "lg", isIconOnly: true })}
          >
            <Icon d={BACK} />
          </NextLink>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{manifest.series.title}</p>
            <p className="text-xs text-muted tabular-nums" data-testid="lector-posicion">
              Capítulo {number} · {current + 1}/{pages.length}
            </p>
          </div>
          <ThemeToggle />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-px h-0.5 origin-left bg-accent transition-transform duration-150 motion-reduce:transition-none"
          style={{ transform: `scaleX(${pages.length ? (current + 1) / pages.length : 0})` }}
        />
      </header>

      <main
        className="mx-auto w-full max-w-3xl"
        // Tocar la lectura muestra u oculta las barras; los botones de una Página rota no cuentan.
        onClick={(event) => {
          if (!(event.target as Element).closest("a, button")) setChrome((on) => !on);
        }}
      >
        {pages.map((p, i) => {
          const want = i >= current - BEHIND && i <= current + AHEAD;
          const { tries, bust } = attempts[p.id] ?? { tries: 0, bust: 0 };
          const broken = tries >= 2;
          // El cache-buster cambia en cada intento manual: con la misma URL el
          // navegador reutiliza el 404 cacheado y no vuelve a pedirla.
          const src =
            tries === 1
              ? `${p.url}${p.url.includes("?") ? "&" : "?"}retry=${bust + 1}`
              : p.url;
          return (
            <figure
              key={p.id}
              ref={(el) => {
                figures.current[i] = el;
              }}
              data-testid={`pagina-${p.position}`}
              className="relative m-0 overflow-hidden bg-surface-secondary"
              style={{ aspectRatio: String(ratios[p.id] ?? DEFAULT_RATIO) }}
            >
              {broken ? (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex flex-col items-center gap-3 px-4 text-center">
                    <p className="text-sm text-muted">No se pudo cargar la Página {p.position + 1}.</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() =>
                        setAttempts((prev) => ({
                          ...prev,
                          [p.id]: { tries: 1, bust: (prev[p.id]?.bust ?? 0) + 1 },
                        }))
                      }
                    >
                      Reintentar
                    </Button>
                  </div>
                </div>
              ) : want ? (
                <img
                  src={src}
                  alt={`Página ${p.position + 1}`}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    if (!img.naturalWidth) return;
                    const ratio = img.naturalWidth / img.naturalHeight;
                    idbPut(readerDb.current, "dims", p.id, ratio);
                    setRatios((prev) => (prev[p.id] === ratio ? prev : { ...prev, [p.id]: ratio }));
                  }}
                  onError={() => onError(p)}
                />
              ) : null}
            </figure>
          );
        })}

        <nav aria-label="Fin del Capítulo" className="mx-auto flex max-w-sm flex-col gap-3 px-4 pt-14 pb-28">
          <p className="text-center text-sm text-muted">
            {nextChapter ? `Fin del Capítulo ${number}` : "Es el último Capítulo publicado"}
          </p>
          {nextChapter ? (
            <NextLink
              href={chapterHref(nextChapter)}
              className={buttonVariants({ size: "lg", fullWidth: true })}
              data-testid="capitulo-siguiente"
            >
              Siguiente: Capítulo {chapterNumber.format(nextChapter.number)}
              <Icon d={FORWARD} />
            </NextLink>
          ) : (
            <NextLink href={seriesHref} className={buttonVariants({ size: "lg", fullWidth: true })}>
              Volver a la Serie
            </NextLink>
          )}
          <div className="flex gap-3">
            {prevChapter ? (
              <NextLink
                href={chapterHref(prevChapter)}
                className={buttonVariants({ variant: "secondary", size: "lg", className: "flex-1" })}
                data-testid="capitulo-anterior"
              >
                <Icon d={BACK} />
                Capítulo {chapterNumber.format(prevChapter.number)}
              </NextLink>
            ) : null}
            <Button variant="secondary" size="lg" className="flex-1" onPress={() => setListOpen(true)}>
              <Icon d={GRID} />
              Capítulos
            </Button>
          </div>
          {nextChapter ? (
            <NextLink
              href={seriesHref}
              className="mx-auto mt-2 rounded-sm text-sm text-muted underline underline-offset-4 hover:text-foreground"
            >
              Volver a la Serie
            </NextLink>
          ) : null}
        </nav>
      </main>

      <nav
        aria-label="Capítulos"
        onFocus={() => setChrome(true)}
        className={`fixed inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)] ${bar} ${chrome ? "" : "translate-y-full"}`}
      >
        {/* En el móvil anterior y siguiente son flechas (el nombre accesible sigue ahí): el centro necesita el sitio. */}
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-2 px-3">
          {prevChapter ? (
            <NextLink
              href={chapterHref(prevChapter)}
              className={buttonVariants({ variant: "secondary", size: "lg", className: step })}
            >
              <Icon d={BACK} />
              <span className="max-sm:sr-only">Anterior</span>
            </NextLink>
          ) : (
            <Button variant="secondary" size="lg" isDisabled className={step}>
              <Icon d={BACK} />
              <span className="max-sm:sr-only">Anterior</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="lg"
            className="min-w-0 flex-1"
            aria-label={`Capítulo ${number}: ver todos los Capítulos`}
            onPress={() => setListOpen(true)}
          >
            <Icon d={GRID} />
            <span className="truncate tabular-nums">Capítulo {number}</span>
          </Button>
          {nextChapter ? (
            <NextLink href={chapterHref(nextChapter)} className={buttonVariants({ size: "lg", className: step })}>
              <span className="max-sm:sr-only">Siguiente</span>
              <Icon d={FORWARD} />
            </NextLink>
          ) : (
            <Button size="lg" isDisabled className={step}>
              <span className="max-sm:sr-only">Siguiente</span>
              <Icon d={FORWARD} />
            </Button>
          )}
        </div>
      </nav>

      <Drawer.Backdrop isOpen={listOpen} onOpenChange={setListOpen}>
        <Drawer.Content placement="bottom">
          <Drawer.Dialog className="sm:mx-auto sm:max-w-lg">
            <Drawer.Handle />
            <Drawer.CloseTrigger aria-label="Cerrar" />
            <Drawer.Header>
              <Drawer.Heading>Capítulos</Drawer.Heading>
              <p className="text-sm text-muted tabular-nums">
                {manifest.series.title} · {chapters.length} publicados
              </p>
            </Drawer.Header>
            <Drawer.Body>
              <ol className="relative grid grid-cols-5 gap-2 p-1 sm:grid-cols-6">
                {chapters.map((c) => {
                  const here = c.externalId === externalId;
                  return (
                    <li key={c.externalId}>
                      <NextLink
                        href={chapterHref(c)}
                        prefetch={false}
                        ref={here ? centerInList : undefined}
                        aria-current={here ? "page" : undefined}
                        className={`grid h-11 place-items-center rounded-lg text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-overlay ${
                          here
                            ? "bg-accent font-semibold text-accent-foreground"
                            : "bg-surface-secondary text-foreground hover:bg-surface-tertiary"
                        }`}
                      >
                        <span className="sr-only">Capítulo </span>
                        {chapterNumber.format(c.number)}
                      </NextLink>
                    </li>
                  );
                })}
              </ol>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}
