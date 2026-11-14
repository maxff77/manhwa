# Manhwa

Plataforma de lectura de manhwa en español: catálogo, lector webtoon, biblioteca personal y lectura offline.

## Language

**Serie**:
Obra de manhwa, independiente de la Fuente de la que se obtiene.
_Avoid_: cómic, manga, título

**Catálogo**:
Conjunto de Series ingestadas desde las Fuentes de contenido, visible para cualquier visitante.
_Avoid_: inventario, listado, librería

**Búsqueda**:
Consulta textual de un visitante o Usuario sobre los títulos del Catálogo.
_Avoid_: filtro, búsqueda avanzada

**Fuente**:
Sitio externo del que se obtiene contenido o metadata (Olympus, MangaDex).
_Avoid_: scraper, proveedor, backend

**Fuente de contenido**:
Fuente que expone Series, Capítulos y Páginas (Olympus en v1).
_Avoid_: origen, scraper

**Fuente de metadata**:
Fuente que solo aporta metadata de Series, sin Capítulos ni Páginas (MangaDex).
_Avoid_: proveedor de datos

**Adaptador de fuente**:
Implementación de la interfaz `SourceAdapter` que traduce una Fuente a los datos que consume la plataforma.
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

**Alerta**:
Aviso que recibe un Usuario cuando una Serie que sigue publica un Capítulo nuevo. Solo cubre Capítulos descubiertos después de ese Seguimiento.
_Avoid_: notificación, push, aviso

**Usuario**:
Persona con cuenta en la plataforma, dueña de su Biblioteca y sus Colecciones.
_Avoid_: cuenta, lector, perfil

**Progreso**:
Posición de lectura de un Usuario dentro de una Serie: último Capítulo leído y última página vista.
_Avoid_: historial, marca

**Descarga**:
Copia local de las Páginas de un Capítulo en el dispositivo de un Usuario, legible sin conexión. Vive en el dispositivo, no en la cuenta.
_Avoid_: caché, copia offline

**Precarga automática**:
Descarga que la aplicación inicia sin una petición explícita del Usuario, bajo su permiso, del próximo Capítulo no leído de una Serie en lectura.
_Avoid_: autodescarga, descarga automática
