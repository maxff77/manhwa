import { createServer, type Server } from "node:http";

/** PNG 1×1 transparente: fixture de Página servida en local, cero red externa (v1.md). */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export interface ImageFixture {
  origin: string;
  /** URL de una Página; `fail` la hace responder 404 siempre. */
  url(path: string): string;
  close(): Promise<void>;
}

/**
 * Servidor estático local de imágenes para la suite del lector. Las rutas bajo
 * `/roto/` responden 404 para ejercitar el reintento y el placeholder; el resto
 * responde el PNG con CORS abierto para poder medir dimensiones naturales.
 */
export async function startImageFixture(): Promise<ImageFixture> {
  const server: Server = createServer((req, res) => {
    const path = req.url ?? "/";
    // Una Página rota responde 404 también con cache-buster: el reintento
    // automático falla y el lector debe mostrar el placeholder.
    if (path.startsWith("/roto/")) {
      res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": String(PNG_1x1.length),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(PNG_1x1);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("El servidor de imágenes no expuso un puerto");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    url: (path: string) => `${origin}${path.startsWith("/") ? path : `/${path}`}`,
    close: async () => {
      // El navegador deja sockets keep-alive abiertos tras cargar las Páginas:
      // `close()` solo espera a que se cierren y el teardown del test colgaba
      // hasta el timeout de 30 s. Se cierran las conexiones activas primero.
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}