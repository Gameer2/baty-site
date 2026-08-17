import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DETERMINANT_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "determinant",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "2,-1,0;-1,2,-1;0,-1,2",
    },
  ],
  outputs: [
    { key: "det", label: "det(A)", kind: "number" },
    { key: "singular", label: "singular (1/0)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/determinant.html",
  pageStoreKey: "engine-lab:linear-algebra-determinant",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    try {
      const det = LinAlg.determinant(A);
      return { outputs: { det, singular: Math.abs(det) < 1e-12 ? 1 : 0 } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
