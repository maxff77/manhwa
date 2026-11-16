import { Card, Link } from "@heroui/react";

import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-surface focus:text-foreground focus:shadow-overlay"
      >
        Saltar al contenido
      </a>

      <header className="border-b border-separator">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            Manhwa
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <section aria-labelledby="catalog-title" className="flex flex-col gap-6">
          <div className="flex max-w-prose flex-col gap-1">
            <h1 id="catalog-title" className="text-3xl font-semibold tracking-tight">
              Catálogo
            </h1>
            <p className="text-muted">Series de manhwa para leer en vertical, sin instalar nada.</p>
          </div>

          <Card className="max-w-xl">
            <Card.Header>
              <h2 className="text-sm leading-6 font-medium text-foreground">
                El Catálogo está vacío
              </h2>
              <Card.Description>Vuelve pronto para descubrir Series.</Card.Description>
            </Card.Header>
          </Card>
        </section>
      </main>
    </div>
  );
}
