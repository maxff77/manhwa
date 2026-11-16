/**
 * Valida la composición una vez al arrancar el servidor: sin `SOURCE_ADAPTER`
 * válido la app no levanta, y producción no cae en el adaptador falso.
 *
 * El import es dinámico para que Prisma no entre en el bundle de Edge: este
 * hook se compila para los dos runtimes y el guard solo se cumple en Node.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { createComposition } = await import("./composition");
    createComposition();
  }
}
