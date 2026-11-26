"use client";

import { Label, ScrollShadow, Tag, TagGroup } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useTransition } from "react";

import { PagerButton, useScrollPager } from "@/components/rail";

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

/**
 * Filtro de géneros de varios a la vez: la selección vive en la URL
 * (`/?genre=A&genre=B`), así que se comparte y sobrevive a recargar.
 */
export function GenreFilter({
  genres,
  selected,
}: {
  genres: Array<{ id: string; label: string }>;
  selected: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // La marca cambia al tocar; la página llega cuando el servidor responde.
  const [current, setCurrent] = useOptimistic(selected);
  const pager = useScrollPager();

  // Un enlace compartido puede marcar un género que queda fuera de la fila:
  // al montar, se desplaza la fila (solo en horizontal) hasta el primero.
  useEffect(() => {
    const row = pager.ref.current;
    const first = row?.querySelector<HTMLElement>('[data-selected="true"]');
    if (!row || !first) return;
    const rowBox = row.getBoundingClientRect();
    const tagBox = first.getBoundingClientRect();
    if (tagBox.right > rowBox.right) row.scrollLeft += tagBox.left - rowBox.left - rowBox.width / 3;
  }, [pager.ref]);

  return (
    <div className="relative">
      <TagGroup
        selectionMode="multiple"
        size="lg"
        selectedKeys={current}
        onSelectionChange={(keys) => {
          if (keys === "all") return;
          // Orden de popularidad, no de clic: la URL es estable para la misma selección.
          const next = genres.map((genre) => genre.id).filter((id) => keys.has(id));
          startTransition(() => {
            setCurrent(next);
            const query = new URLSearchParams(next.map((id) => ["genre", id]));
            router.push(next.length > 0 ? `/?${query}` : "/", { scroll: false });
          });
        }}
      >
        <Label className="sr-only">Géneros</Label>
        <ScrollShadow
          ref={pager.ref}
          orientation="horizontal"
          hideScrollBar
          size={48}
          onVisibilityChange={pager.onVisibilityChange}
        >
          {/* py-1: el anillo de foco sobresale 4 px y la fila recorta lo que se sale. */}
          <TagGroup.List className="w-max flex-nowrap px-4 py-1 sm:px-6">
            {genres.map((genre) => (
              <Tag
                key={genre.id}
                id={genre.id}
                textValue={genre.label}
                className="rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[selected=true]:hover:bg-accent-hover"
              >
                {({ isSelected }) => (
                  <>
                    {isSelected ? <CheckIcon /> : null}
                    {genre.label}
                  </>
                )}
              </Tag>
            ))}
          </TagGroup.List>
        </ScrollShadow>
      </TagGroup>

      {/* Con ratón la rueda no desplaza la fila; con teclado las flechas del grid ya lo hacen.
          El degradado sólido da al botón un suelo limpio: sin él asomaban trozos de chip. */}
      {pager.canGoBack ? (
        <div className="absolute inset-y-0 left-0 hidden w-28 items-center bg-linear-to-r from-background from-55% to-transparent pl-4 pointer-fine:flex sm:pl-6">
          <PagerButton
            direction="back"
            label="Géneros anteriores"
            excludeFromTabOrder
            onPress={() => pager.page(-1)}
            className="border border-border bg-overlay text-overlay-foreground shadow-overlay"
          />
        </div>
      ) : null}
      {pager.canGoForward ? (
        <div className="absolute inset-y-0 right-0 hidden w-28 items-center justify-end bg-linear-to-l from-background from-55% to-transparent pr-4 pointer-fine:flex sm:pr-6">
          <PagerButton
            direction="forward"
            label="Más géneros"
            excludeFromTabOrder
            onPress={() => pager.page(1)}
            className="border border-border bg-overlay text-overlay-foreground shadow-overlay"
          />
        </div>
      ) : null}
    </div>
  );
}
