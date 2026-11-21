# Prototipo: forma del lector webtoon

Ticket wayfinder: #5. Pregunta: ¿cómo se siente leer un capítulo de 100–300
imágenes con scroll vertical continuo en móvil, y qué se rompe?

Prototipo desechable. No es código de producción y no se mergea a `main`.

## Cómo probarlo

    python3 prototype/reader/serve.py
    # móvil en la misma Wi-Fi → http://<ip-de-la-mac>:8080/

Genera 300 páginas locales (720 px de ancho, 1400–2200 px de alto) en `pages/`
la primera vez. Dos capítulos reutilizan las mismas 300 imágenes.

## Variantes (píldora inferior, `←` / `→`)

- **A — naive**: las 300 `<img>` con `loading="lazy"`, sin dimensiones.
  Restaura con `scrollY` absoluto antes de que carguen las imágenes; sin
  precarga explícita.
- **B — ventana JS**: figura con `aspect-ratio` real del manifiesto (espacio
  reservado), ventana `[actual-2, actual+5]` con `src`, el resto liberado.
  Restauración exacta por página + offset.
- **C — CSS**: `content-visibility: auto` +
  `contain-intrinsic-size: auto 1800px` + `loading="lazy"`. Restauración
  aproximada por ratio.

## Resultado de la prueba (2026-11-14)

- El usuario percibió las tres variantes iguales al leer y eligió primero **C**
  por el contador de imágenes cargadas.
- Al explicarle que el contador mide memoria retenida (más bajo = menos
  imágenes vivas), corrigió la elección a **B**.
- El contador es un indicador de debug, no una feature: en A y C sube porque
  las imágenes se acumulan; en B se mantiene bajo porque la ventana las libera.
- No se reportaron huecos, tirones, saltos de layout ni recargas de pestaña.
- Dispositivo y navegador de la prueba: no registrados.

## Qué se rompe / qué queda sin validar

- **Memoria**: no medida en dispositivo. B acota el riesgo por diseño
  (ventana + liberación); C lo dejaba a la evicción del navegador.
  Validar en iOS Safari con un capítulo completo.
- **Saltos de layout**: en C, `contain-intrinsic-size: auto 1800px` contra
  alturas reales de 1400–2200 px; esperables, no reportados. B reserva la
  altura real y no debería saltar.
- **Scroll infinito**: el capítulo es finito (300 páginas); no se probó un
  feed infinito.
- **iOS**: sin validar (no se registró el dispositivo de la prueba).

## Decisión

**B — ventana JS + precarga** como estrategia de render: mantiene una ventana
`[actual-2, actual+5]` y libera las imágenes lejanas, que es lo único que
mantiene la memoria acotada con 300 páginas. Trade-off aceptado: con un fling
muy rápido pueden verse huecos grises hasta que cargan las siguientes.
C queda descartada como estrategia principal (no libera imágenes por sí sola).
La decisión y su contexto viven en el issue #5 y en el mapa #1.
