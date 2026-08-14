import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// The grid's columns ARE the vectors — matches independence-basis.js's own columnsOf(A) helper.
const columnsOf = (A: number[][]): number[][] =>
  A[0].map((_, j) => A.map((row) => row[j]));

export const INDEPENDENCE_BASIS_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "independence-basis",
  inputs: [
    {
      key: "A",
      label: "vectors (cols ;)",
      kind: "matrix",
      default: "1,2,0;0,0,1;0,0,0",
    },
  ],
  outputs: [
    { key: "basis", label: "basis", kind: "matrix" },
    { key: "independent", label: "independent (1/0)", kind: "number" },
    { key: "rank", label: "rank", kind: "number" },
    { key: "spanDimension", label: "dim(span)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/independence-basis.html",
  pageStoreKey: "engine-lab:linear-algebra-independence-basis",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0) {
      return { outputs: {}, error: "Matrix must have at least one row." };
    }
    try {
      const vecs = columnsOf(A);
      const ind = LinAlg.isLinearlyIndependent(vecs);
      const basis = LinAlg.basisFromSpanningSet(vecs);
      return {
        outputs: {
          // basis.basis is an array of the selected spanning vectors (each a number[]).
          basis: basis.basis,
          independent: ind.independent ? 1 : 0,
          rank: ind.rank,
          spanDimension: basis.dimension,
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
