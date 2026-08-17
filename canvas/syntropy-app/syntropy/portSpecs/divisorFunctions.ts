import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DIVISOR_FUNCTIONS_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "divisor-functions",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "12" }],
  outputs: [
    { key: "tau", label: "tau(n)", kind: "number" },
    { key: "sigma", label: "sigma(n)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/divisor-functions.html",
  pageStoreKey: "engine-lab:number-theory-divisor-functions",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      if (n < 1n) {
        return { outputs: {}, error: "n must be at least 1." };
      }
      const tau = NumberTheory.tau(n);
      const sigma = NumberTheory.sigma(n);
      return {
        outputs: { tau: bigIntToDisplay(tau), sigma: bigIntToDisplay(sigma) },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
