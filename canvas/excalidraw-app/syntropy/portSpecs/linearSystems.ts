import { parseMatrix, parseNumberList } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const LINEAR_SYSTEMS_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "linear-systems",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "1,2,3;2,4,6;1,1,1",
    },
    { key: "b", label: "b", kind: "vector", default: "6,12,3" },
  ],
  outputs: [
    { key: "solution", label: "x", kind: "matrix" },
    { key: "consistent", label: "consistent (1/0)", kind: "number" },
    { key: "rank", label: "rank(A)", kind: "number" },
    { key: "augmentedRank", label: "rank([A|b])", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/linear-systems.html",
  pageStoreKey: "engine-lab:linear-algebra-linear-systems",
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
      const s = LinAlg.solveSystem(A, b);
      // The solution is a column vector: the unique x, or a particular solution for an
      // underdetermined system. Inconsistent systems have no solution -> empty grid. Rendered
      // as a single-column matrix (number[][]); the nullspace basis is left to a future
      // "A -> RREF" refinement.
      const solution =
        s.type === "unique"
          ? s.solution.map((x) => [x])
          : s.type === "infinite"
          ? s.particular.map((x) => [x])
          : [];
      return {
        outputs: {
          solution,
          consistent: s.type === "none" ? 0 : 1,
          rank: s.rank,
          augmentedRank: s.augmentedRank,
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
