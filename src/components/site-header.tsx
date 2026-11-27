import { buttonVariants } from "@heroui/styles";
import NextLink from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Barra de la app fuera del lector. La raíz (el Catálogo) muestra la marca; las
 * pantallas de debajo muestran «‹ Destino» para subir un nivel, como en el móvil.
 */
export function SiteHeader({ back }: { back?: { href: string; label: string } }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-surface focus:text-foreground focus:shadow-overlay"
      >
        Saltar al contenido
      </a>

      <header className="border-b border-separator">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {back ? (
            <NextLink
              href={back.href}
              // -ml-3: la flecha queda alineada con el borde del contenido, no el fondo del botón.
              className={buttonVariants({ variant: "ghost", size: "lg", className: "-ml-3 gap-1 px-3" })}
            >
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              {back.label}
            </NextLink>
          ) : (
            <NextLink
              href="/"
              className="rounded-sm text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:status-focused"
            >
              Manhwa
            </NextLink>
          )}
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}
