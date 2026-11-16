import { prisma } from "../../src/lib/db";

type SeriesInput = Parameters<typeof prisma.series.create>[0]["data"];

/** Serie de prueba con valores estables del dominio; cada test puede sobrescribir campos. */
export function seedSeries(overrides: Partial<SeriesInput> = {}) {
  return prisma.series.create({
    data: {
      slug: "academia-de-la-ascension",
      title: "Academia de la Ascensión",
      titleNormalized: "academia de la ascension",
      status: "ONGOING",
      genres: ["Acción"],
      authors: [],
      ...overrides,
    },
  });
}
