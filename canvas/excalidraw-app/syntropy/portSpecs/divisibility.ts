import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DIVISIBILITY_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "divisibility",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "17" },
    { key: "b", label: "b", kind: "expression", default: "5" },
  ],
  outputs: [
    { key: "q", label: "q", kind: "number" },
    { key: "r", label: "r", kind: "number" },
    { key: "divides", label: "b|a (1/0)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/divisibility.html",
  pageStoreKey: "engine-lab:number-theory-divisibility",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const b = parseBigInt(inputs.b, "b");
      if (b === 0n) {
        return { outputs: {}, error: "b must be nonzero." };
      }
      const { q, r } = NumberTheory.divide(a, b);
      return {
        outputs: {
          q: bigIntToDisplay(q),
          r: bigIntToDisplay(r),
          divides: r === 0n ? 1 : 0,
        },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
