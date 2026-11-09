---
title: El modelo de lectura separa la obra de su fuente y la página de su estado de caché
author: Richard
date: 2026-11-09
branch: docs/modelo-datos
cost: { minutes: 24, tokens: 64769 }
id: l-2ae0db33
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - prisma/schema.prisma
  - docs/agents/issue-tracker.md
  - docs/agents/domain.md
---

## Decided
- La Serie es interna e independiente de la Fuente; las identidades externas viven en un mapping (fuente, id externo). Una Serie acumula varias fuentes; MangaDex solo aporta metadata.
- El Capítulo pertenece a una Fuente (source-scoped). No hay tabla de mapping de capítulos: el contenido viene de una sola fuente en v1 y el mapping solo serviría para fusionar capítulos entre fuentes.
- Las versiones de capítulo del origen se ignoran: una fila por capítulo, con la primera/única versión.
- "Página" es una imagen del capítulo. La tabla guarda su estado de caché (URL de origen, clave en R2, estado pending/ready/error), no la imagen. Las filas se crean lazy al abrir el capítulo.
- Progreso: una fila por usuario+serie con capítulo y página; gana el último leído, no el máximo. Sin historial por capítulo.
- Seguimiento y Colección son entidades distintas; Biblioteca no es tabla, es la unión de seguimientos, progreso y colecciones.
- Borrar cuenta es hard delete en cascada; el contenido compartido no se toca.
- Credenciales, OAuth y sesiones se difieren al ticket de autenticación; el usuario del dominio queda mínimo.

## Tried and ruled out
- Mapping de capítulos por fuente: descartado por especulativo; solo haría falta al fusionar capítulos de dos fuentes.
- Guardar el array de imágenes como JSON en el capítulo: descartado porque pierde el estado por imagen y obliga a re-descargar el capítulo entero si falla una.
- Modelar versiones de capítulo: descartado; duplica capítulos y no hay UI que las use en v1.
- Llamar "Image" al modelo en vez de "Page": descartado porque el término del dominio es Página, "Image" choca con las portadas y con next/image, y el modelo no es la imagen sino su entrada de caché.

## Watch out
- La unicidad de número por serie+fuente asume que el origen no repite números. Si aparecen especiales duplicados, el sync falla y hay que relajar esa restricción.
- Sin marcas de leído ni historial por capítulo, "próximo capítulo no leído" solo puede calcularse como marcador + 1.
- La cola de revisión manual de matches de metadata quedó fuera del esquema v1: es herramienta offline, no tabla.

In the code:
- prisma/schema.prisma (modelos Series, SeriesSource, Chapter, Page, Progress, Follow, Collection)
- GLOSSARY.md (Página, Seguimiento, Usuario)
- Validación: DATABASE_URL='postgresql://user:pass@localhost:5432/manhwa' npx -y prisma@6 validate --schema prisma/schema.prisma
