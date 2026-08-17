import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const LINEAR_DIOPHANTINE_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "linear-diophantine",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "6" },
    { key: "b", label: "b", kind: "expression", default: "15" },
    { key: "c", label: "c", kind: "expression", default: "9" },
  ],
  outputs: [
    { key: "solvable", label: "solvable (1/0)", kind: "number" },
    { key: "x0", label: "x0", kind: "number" },
    { key: "y0", label: "y0", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/linear-diophantine.html",
  pageStoreKey: "engine-lab:number-theory-linear-diophantine",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const b = parseBigInt(inputs.b, "b");
      const c = parseBigInt(inputs.c, "c");
      const r = NumberTheory.solveLinearDiophantine(a, b, c);
      if (!r.solvable) {
        return { outputs: { solvable: 0 } };
      }
      if ("everyPairSolves" in r) {
        return { outputs: { solvable: 1, x0: 0, y0: 0 } };
      }
      return {
        outputs: {
          solvable: 1,
          x0: bigIntToDisplay(r.x0),
          y0: bigIntToDisplay(r.y0),
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
