import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const EULER_TOTIENT_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "euler-totient",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "1000" }],
  outputs: [{ key: "phi", label: "phi(n)", kind: "number" }],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/euler-totient.html",
  pageStoreKey: "engine-lab:number-theory-euler-totient",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      if (n < 1n) {
        return { outputs: {}, error: "n must be at least 1." };
      }
      const phi = NumberTheory.totient(n);
      return { outputs: { phi: bigIntToDisplay(phi) } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
