import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const PELLS_EQUATION_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "pells-equation",
  inputs: [{ key: "D", label: "D", kind: "expression", default: "109" }],
  outputs: [
    { key: "solvable", label: "solvable (1/0)", kind: "number" },
    { key: "x", label: "x", kind: "number" },
    { key: "y", label: "y", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/pells-equation.html",
  pageStoreKey: "engine-lab:number-theory-pells-equation",
  compute: (inputs): ComputeResult => {
    try {
      const D = parseBigInt(inputs.D, "D");
      if (D < 0n) {
        return { outputs: {}, error: "D must be non-negative." };
      }
      const r = NumberTheory.pellSolve(D);
      if (!r.solvable) {
        return { outputs: { solvable: 0 }, error: r.reason };
      }
      return {
        outputs: {
          solvable: 1,
          x: bigIntToDisplay(r.x),
          y: bigIntToDisplay(r.y),
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
