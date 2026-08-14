import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const ROW_REDUCTION_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "row-reduction",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "1,2,-1,3;2,4,-2,6;3,6,-3,9",
    },
  ],
  outputs: [
    { key: "R", label: "RREF", kind: "matrix" },
    { key: "rank", label: "rank", kind: "number" },
    { key: "freeColumns", label: "free cols", kind: "number" },
    { key: "rowOps", label: "row ops", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/row-reduction.html",
  pageStoreKey: "engine-lab:linear-algebra-row-reduction",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0) {
      return { outputs: {}, error: "Matrix must have at least one row." };
    }
    try {
      const r = LinAlg.rref(A);
      return {
        outputs: {
          R: r.R,
          rank: r.rank,
          freeColumns: r.freeCols.length,
          rowOps: r.steps.length,
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
