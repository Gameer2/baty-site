import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const EIGENVALUES_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "eigenvalues",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "4,-2,1;-2,4,-2;1,-2,4",
    },
  ],
  outputs: [
    { key: "eigenpairs", label: "eigenpairs", kind: "eigenpairs" },
    { key: "allReal", label: "all real (1/0)", kind: "number" },
    { key: "trace", label: "trace", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/eigenvalues.html",
  pageStoreKey: "engine-lab:linear-algebra-eigenvalues",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    try {
      const e = LinAlg.eigenvalues(A);
      let trace = 0;
      for (let i = 0; i < A.length; i++) {
        trace += A[i][i];
      }
      // Build real eigenpairs from the real eigenvalues (e.real) + the existing
      // eigenvectorsFor core (the eigenspace basis). Complex eigenvalues have no real
      // eigenvector, so they're surfaced only via the allReal flag in v1.
      const eigenpairs = e.real.map((lambda) => ({
        eigenvalue: lambda,
        vectors: LinAlg.eigenvectorsFor(A, lambda),
      }));
      return {
        outputs: {
          eigenpairs,
          allReal: e.hasComplex ? 0 : 1,
          trace,
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
