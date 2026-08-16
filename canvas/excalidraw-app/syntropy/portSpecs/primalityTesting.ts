import { parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const PRIMALITY_TESTING_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "primality-testing",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "1105" }],
  outputs: [{ key: "prime", label: "prime (1/0)", kind: "number" }],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/primality-testing.html",
  pageStoreKey: "engine-lab:number-theory-primality-testing",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      const r = NumberTheory.millerRabin(n);
      return { outputs: { prime: r.prime ? 1 : 0 } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
