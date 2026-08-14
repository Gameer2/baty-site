import { parseMatrix, parseNumberList } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const ITERATIVE_SOLVERS_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "iterative-solvers",
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
    { key: "jacobiSweeps", label: "Jacobi sweeps", kind: "number" },
    { key: "gsSweeps", label: "Gauss-Seidel sweeps", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/iterative-solvers.html",
  pageStoreKey: "engine-lab:linear-algebra-iterative-solvers",
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
      const jacobi = LinAlg.jacobi(A, b, 1e-12, 500);
      const gs = LinAlg.gaussSeidel(A, b, 1e-12, 500);
      return {
        outputs: {
          // The Jacobi sweep trace is the primary iteration sequence; Gauss-Seidel is summarized
          // by its sweep count below (TraceNode renders one trace, so the two-solver comparison
          // keeps its scalar side-by-side rather than a second trace table).
          iterationTrace: jacobi.iterations,
          jacobiSweeps: jacobi.converged ? jacobi.sweeps : -1,
          gsSweeps: gs.converged ? gs.sweeps : -1,
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
