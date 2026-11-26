"use client";

import { Button, ScrollShadow } from "@heroui/react";
import { linkVariants } from "@heroui/styles";
import NextLink from "next/link";
import { useId, useRef, useState } from "react";

/**
 * Desplazamiento por páginas de una fila horizontal. La rueda vertical del
 * ratón no desplaza en horizontal: con puntero fino hacen falta botones.
 */
export function useScrollPager() {
  const ref = useRef<HTMLDivElement>(null);
  // Lo que informa ScrollShadow: "left" = se puede volver, "right" = se puede avanzar.
  const [edges, setEdges] = useState("none");

  function page(direction: 1 | -1) {
    const row = ref.current;
    if (!row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({ left: direction * row.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  }

  return {
    ref,
    onVisibilityChange: setEdges,
    canGoBack: edges === "left" || edges === "both",
    canGoForward: edges === "right" || edges === "both",
    page,
  };
}

export function PagerButton({
  direction,
  label,
  isDisabled,
  excludeFromTabOrder,
  onPress,
  className,
}: {
  direction: "back" | "forward";
  label: string;
  isDisabled?: boolean;
  excludeFromTabOrder?: boolean;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Button
      isIconOnly
      size="sm"
      variant="tertiary"
      aria-label={label}
      isDisabled={isDisabled}
      excludeFromTabOrder={excludeFromTabOrder}
      onPress={onPress}
      className={className}
    >
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
      >
        <path d={direction === "back" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </Button>
  );
}

const link = linkVariants();

/** Carril horizontal de Series: en táctil se desliza; con ratón, botones. */
export function Rail({
  title,
  moreHref,
  children,
}: {
  title: string;
  moreHref?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  const pager = useScrollPager();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex min-h-10 items-center justify-between gap-4 px-4 sm:px-6">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight text-balance">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {moreHref ? (
            // «Ver más», no «Ver todo»: la vista filtrada enseña las 50 más recientes.
            <NextLink
              href={moreHref}
              className={link.base({ className: "text-sm underline underline-offset-4" })}
            >
              Ver más<span className="sr-only"> de {title}</span>
            </NextLink>
          ) : null}
          {pager.canGoBack || pager.canGoForward ? (
            <div className="hidden gap-1 pointer-fine:flex">
              <PagerButton
                direction="back"
                label={`Anteriores de ${title}`}
                isDisabled={!pager.canGoBack}
                onPress={() => pager.page(-1)}
              />
              <PagerButton
                direction="forward"
                label={`Siguientes de ${title}`}
                isDisabled={!pager.canGoForward}
                onPress={() => pager.page(1)}
              />
            </div>
          ) : null}
        </div>
      </div>
      <ScrollShadow
        ref={pager.ref}
        orientation="horizontal"
        hideScrollBar
        size={48}
        onVisibilityChange={pager.onVisibilityChange}
        className="snap-x snap-mandatory scroll-px-4 sm:scroll-px-6"
      >
        {/* py-1: el anillo de foco sobresale 4 px y el carril recorta lo que se sale. */}
        <ul className="flex w-max gap-3 px-4 py-1 sm:gap-4 sm:px-6">{children}</ul>
      </ScrollShadow>
    </section>
  );
}
