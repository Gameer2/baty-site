import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const MOBIUS_FUNCTION_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "mobius-function",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "12" }],
  outputs: [{ key: "mu", label: "mu(n)", kind: "number" }],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/mobius-function.html",
  pageStoreKey: "engine-lab:number-theory-mobius-function",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      if (n < 1n) {
        return { outputs: {}, error: "n must be at least 1." };
      }
      const mu = NumberTheory.mobius(n);
      return { outputs: { mu: bigIntToDisplay(mu) } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
