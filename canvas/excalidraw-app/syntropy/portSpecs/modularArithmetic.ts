import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const MODULAR_ARITHMETIC_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "modular-arithmetic",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "17" },
    { key: "n", label: "n", kind: "expression", default: "12" },
  ],
  outputs: [{ key: "result", label: "a mod n", kind: "number" }],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/modular-arithmetic.html",
  pageStoreKey: "engine-lab:number-theory-modular-arithmetic",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const n = parseBigInt(inputs.n, "n");
      const result = NumberTheory.mod(a, n);
      return { outputs: { result: bigIntToDisplay(result) } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
