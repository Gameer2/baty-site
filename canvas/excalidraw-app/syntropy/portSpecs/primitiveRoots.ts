import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const PRIMITIVE_ROOTS_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "primitive-roots",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "11" }],
  outputs: [
    { key: "exists", label: "exists (1/0)", kind: "number" },
    { key: "generator", label: "generator", kind: "number" },
    { key: "count", label: "# roots", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/primitive-roots.html",
  pageStoreKey: "engine-lab:number-theory-primitive-roots",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      if (n < 1n) {
        return { outputs: {}, error: "n must be at least 1." };
      }
      if (n > 100000n) {
        return {
          outputs: {},
          error: "n must be at most 100000 for live recompute.",
        };
      }
      const r = NumberTheory.primitiveRoots(n);
      if (!r.exists) {
        return { outputs: { exists: 0 } };
      }
      return {
        outputs: {
          exists: 1,
          generator: bigIntToDisplay(r.generator),
          count: r.count,
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
