# Manhwa

Plataforma de lectura de manhwa en español: catálogo, lector webtoon, biblioteca personal y lectura offline.

## Language

**Serie**:
Obra de manhwa, independiente de la Fuente de la que se obtiene.
_Avoid_: cómic, manga, título

**Fuente**:
Sitio externo del que se obtiene contenido o metadata (manhwaweb, MangaDex).
_Avoid_: scraper, proveedor, backend

**Adaptador de fuente**:
Implementación de la interfaz `SourceAdapter` que traduce una Fuente al modelo del dominio.
_Avoid_: plugin, conector

**Capítulo**:
Unidad de lectura de una Serie, con orden y número propios de su Fuente.
_Avoid_: episodio

**Página**:
Cada imagen que compone un Capítulo; es la unidad de lectura y de caché.
_Avoid_: imagen, slide

**Biblioteca**:
El conjunto de Series que un Usuario sigue, junto con su Progreso y sus Colecciones.
_Avoid_: lista, favoritos, librería

**Colección**:
Lista con nombre y curada por un Usuario (p. ej. «isekai», «para un viernes»). No implica seguir sus Series.
_Avoid_: playlist, lista de reproducción

**Seguimiento**:
Serie que un Usuario marca explícitamente para seguir; alimenta su Biblioteca y las alertas de Capítulos nuevos. No es una Colección.
_Avoid_: favorito, suscripción

**Usuario**:
Persona con cuenta en la plataforma, dueña de su Biblioteca y sus Colecciones.
_Avoid_: cuenta, lector, perfil

**Progreso**:
Posición de lectura de un Usuario dentro de una Serie: último Capítulo leído y última página vista.
_Avoid_: historial, marca
