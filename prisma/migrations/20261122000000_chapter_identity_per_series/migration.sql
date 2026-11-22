-- La identidad de un Capítulo es (seriesId, sourceId, externalId): el segmento
-- de URL se repite entre Series ("1", "2"…). La clave global anterior descartaba
-- los Capítulos legítimos de toda Serie salvo la primera (docs/specs/source-adapter.md).
DROP INDEX "chapters_sourceId_externalId_key";

CREATE UNIQUE INDEX "chapters_seriesId_sourceId_externalId_key" ON "chapters"("seriesId", "sourceId", "externalId");
