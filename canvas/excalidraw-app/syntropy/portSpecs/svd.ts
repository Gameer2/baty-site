import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const SVD_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "svd",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "3,1,1;-1,3,1",
    },
  ],
  outputs: [
    { key: "U", label: "U", kind: "matrix" },
    { key: "S", label: "Σ", kind: "matrix" },
    { key: "V", label: "V", kind: "matrix" },
    { key: "rank", label: "rank", kind: "number" },
    { key: "sigma1", label: "sigma 1", kind: "number" },
    { key: "conditionNumber", label: "cond #", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/svd.html",
  pageStoreKey: "engine-lab:linear-algebra-svd",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0) {
      return { outputs: {}, error: "Matrix must have at least one row." };
    }
    try {
      const svd = LinAlg.svd(A);
      // Build the Σ matrix (m×n) with the singular values on the diagonal — S is returned
      // as a flat number[] of length min(m,n); the rectangular diag fills the rest with 0.
      const Sigma = A.map((row, i) =>
        row.map((_, j) => (i === j ? svd.S[i] ?? 0 : 0)),
      );
      return {
        outputs: {
          U: svd.U,
          S: Sigma,
          V: svd.V,
          rank: svd.rank,
          sigma1: svd.singularValues[0] ?? 0,
          conditionNumber: svd.conditionNumber,
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
