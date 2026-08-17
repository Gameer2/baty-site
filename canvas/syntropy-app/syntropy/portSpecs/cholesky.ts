import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const CHOLESKY_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "cholesky",
  inputs: [
    {
      key: "A",
      label: "A (SPD ;)",
      kind: "matrix",
      default: "4,2,-2;2,10,2;-2,2,5",
    },
  ],
  outputs: [
    { key: "L", label: "L", kind: "matrix" },
    { key: "det", label: "det(A)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/cholesky.html",
  pageStoreKey: "engine-lab:linear-algebra-cholesky",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    try {
      const chol = LinAlg.cholesky(A);
      return { outputs: { L: chol.L, det: chol.det } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
