import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const LU_DECOMPOSITION_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "lu-decomposition",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "2,1,1;4,-6,0;-2,7,2",
    },
  ],
  outputs: [
    { key: "L", label: "L", kind: "matrix" },
    { key: "U", label: "U", kind: "matrix" },
    { key: "det", label: "det(A)", kind: "number" },
    { key: "swaps", label: "row swaps", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/lu-decomposition.html",
  pageStoreKey: "engine-lab:linear-algebra-lu-decomposition",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    try {
      const lu = LinAlg.luDecompose(A);
      return { outputs: { L: lu.L, U: lu.U, det: lu.det, swaps: lu.swaps } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
