import { FakeSourceAdapter } from "../../src/sources/fake";

import { contractFixtures, sourceAdapterContract } from "./suite";

sourceAdapterContract("FakeSourceAdapter", () => new FakeSourceAdapter(contractFixtures));
