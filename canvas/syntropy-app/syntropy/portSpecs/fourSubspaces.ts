import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const FOUR_SUBSPACES_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "four-subspaces",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "1,2,3;4,5,6;7,8,9",
    },
  ],
  outputs: [
    { key: "colA", label: "Col(A) basis", kind: "matrix" },
    { key: "rowA", label: "Row(A) basis", kind: "matrix" },
    { key: "nullA", label: "Null(A) basis", kind: "matrix" },
    { key: "nullAT", label: "Null(Aᵀ) basis", kind: "matrix" },
    { key: "rank", label: "rank", kind: "number" },
    { key: "nullity", label: "nullity", kind: "number" },
    { key: "cols", label: "columns", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/four-subspaces.html",
  pageStoreKey: "engine-lab:linear-algebra-four-subspaces",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0) {
      return { outputs: {}, error: "Matrix must have at least one row." };
    }
    try {
      const rn = LinAlg.rankNullity(A);
      // The four fundamental subspaces. Each core returns an array of basis vectors; we
      // render each vector as a row of its grid (a basis is a set, not a product, so no
      // "A =" relation — see the `relation` opt-in on PortSpec). The left null space is the
      // null space of Aᵀ; transposing is just reshaping, not new method math.
      const colA = LinAlg.columnSpaceBasis(A);
      const rowA = LinAlg.rowSpaceBasis(A);
      const nullA = LinAlg.nullSpaceBasis(A);
      const AT = A[0].map((_, c) => A.map((r) => r[c]));
      const nullAT = LinAlg.nullSpaceBasis(AT);
      return {
        outputs: {
          colA,
          rowA,
          nullA,
          nullAT,
          rank: rn.rank,
          nullity: rn.nullity,
          cols: rn.cols,
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
