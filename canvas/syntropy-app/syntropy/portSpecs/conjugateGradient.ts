import { parseMatrix, parseNumberList } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const CONJUGATE_GRADIENT_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "conjugate-gradient",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "4,-1,0;-1,4,-1;0,-1,4",
    },
    { key: "b", label: "b", kind: "vector", default: "15,10,10" },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "steps", label: "steps", kind: "number" },
    { key: "residual", label: "residual", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/conjugate-gradient.html",
  pageStoreKey: "engine-lab:linear-algebra-conjugate-gradient",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    const b = parseNumberList(inputs.b);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    if (b.length !== A.length) {
      return {
        outputs: {},
        error: `b must have ${A.length} entries.`,
      };
    }
    try {
      const cg = LinAlg.conjugateGradient(A, b, 1e-14);
      const last = cg.iterations[cg.iterations.length - 1];
      return {
        outputs: {
          iterationTrace: cg.iterations,
          steps: cg.steps,
          residual: last ? last.residual : 0,
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
