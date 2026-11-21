import { OlympusSourceAdapter } from "../../src/sources/olympus";

import { sourceAdapterContract } from "./suite";
import { fixtureTransport, olympusResponses } from "./support/olympus-fixtures";

// El adapter real corre la misma suite que el fake: mismas Series, Capítulos y
// Páginas, servidas como JSON/HTML con la forma de Olympus por un transporte de
// fixtures. Sin red. Olympus no expone autores ni año (#20): la suite lo exige
// vacío en vez de dispensar el check.
sourceAdapterContract(
  "OlympusSourceAdapter",
  () => {
    const transport = fixtureTransport(olympusResponses());

    return new OlympusSourceAdapter(transport.http);
  },
  false,
);
