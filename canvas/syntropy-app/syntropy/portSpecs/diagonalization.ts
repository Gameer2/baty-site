import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DIAGONALIZATION_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "diagonalization",
  inputs: [
    {
      key: "A",
      label: "A (rows ;)",
      kind: "matrix",
      default: "4,-2,1;-2,4,-2;1,-2,4",
    },
  ],
  outputs: [
    { key: "P", label: "P", kind: "matrix" },
    { key: "D", label: "D", kind: "matrix" },
    { key: "eigenpairs", label: "eigenpairs", kind: "eigenpairs" },
    { key: "diagonalizable", label: "diagonal. (1/0)", kind: "number" },
    { key: "distinctEigenvalues", label: "distinct eig.", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/diagonalization.html",
  pageStoreKey: "engine-lab:linear-algebra-diagonalization",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    try {
      const d = LinAlg.diagonalize(A);
      // P/D only exist on the diagonalizable branch of the union; the non-diagonalizable
      // branch carries eigenpairs but no factors. Normalize eigenpairs to the shared
      // {eigenvalue, vectors} shape the MatrixNode eigenpairs renderer expects.
      return {
        outputs: {
          P: d.diagonalizable ? d.P : [],
          D: d.diagonalizable ? d.D : [],
          eigenpairs: d.eigenpairs.map((ep) => ({
            eigenvalue: ep.eigenvalue,
            vectors: ep.eigenvectors,
          })),
          diagonalizable: d.diagonalizable ? 1 : 0,
          distinctEigenvalues: d.eigenpairs.length,
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
