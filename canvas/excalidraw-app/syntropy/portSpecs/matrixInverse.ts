import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const MATRIX_INVERSE_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "matrix-inverse",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "2,-1,0;-1,2,-1;0,-1,2",
    },
  ],
  outputs: [
    { key: "inverse", label: "A⁻¹", kind: "matrix" },
    { key: "det", label: "det(A)", kind: "number" },
    { key: "rank", label: "rank", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/matrix-inverse.html",
  pageStoreKey: "engine-lab:linear-algebra-matrix-inverse",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    try {
      const inv = LinAlg.inverse(A);
      const det = LinAlg.determinant(A);
      return { outputs: { inverse: inv.inverse, det, rank: inv.rank } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
