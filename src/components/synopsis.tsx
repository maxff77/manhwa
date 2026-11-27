"use client";

import { Button } from "@heroui/react";
import { useId, useState } from "react";

/**
 * Sinopsis recortada a tres líneas en móvil con «Leer más». En escritorio va
 * entera en su columna y el botón sobra. `long` lo decide el servidor por
 * longitud: medir el texto haría aparecer el botón después de hidratar.
 */
export function Synopsis({ text, long }: { text: string; long: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col items-start gap-1">
      <p
        id={id}
        className={`max-w-prose text-pretty text-[0.9375rem] leading-relaxed text-foreground lg:line-clamp-none ${
          long && !open ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {long ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onPress={() => setOpen(!open)}
          className="-ml-3 underline underline-offset-4 lg:hidden"
        >
          {open ? "Leer menos" : "Leer más"}
        </Button>
      ) : null}
    </div>
  );
}
