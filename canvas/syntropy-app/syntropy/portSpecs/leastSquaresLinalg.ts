import { parseMatrix, parseNumberList } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// Named *Linalg to distinguish from portSpecs/leastSquares.ts (numerical engine's discrete
// curve-fit least squares) — same word, unrelated method, different engine namespace.
export const LEAST_SQUARES_LINALG_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "least-squares",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "1,0;1,1;1,2;1,3",
    },
    { key: "b", label: "b", kind: "vector", default: "1,3,4,8" },
  ],
  outputs: [
    { key: "residualNorm", label: "||Ax-b||", kind: "number" },
    { key: "r2", label: "R^2", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/least-squares.html",
  pageStoreKey: "engine-lab:linear-algebra-least-squares",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    const b = parseNumberList(inputs.b);
    if (A.length === 0) {
      return { outputs: {}, error: "Matrix must have at least one row." };
    }
    if (b.length !== A.length) {
      return {
        outputs: {},
        error: `b must have ${A.length} entries (one per row of A).`,
      };
    }
    try {
      const ls = LinAlg.leastSquares(A, b);
      return { outputs: { residualNorm: ls.residualNorm, r2: ls.r2 } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
