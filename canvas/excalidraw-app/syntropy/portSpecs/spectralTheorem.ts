import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";
import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const SPECTRAL_THEOREM_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "spectral-theorem",
  inputs: [
    {
      key: "A",
      label: "A (symmetric ;)",
      kind: "matrix",
      default: "4,-2,1;-2,4,-2;1,-2,4",
    },
  ],
  outputs: [
    { key: "Q", label: "Q", kind: "matrix" },
    { key: "D", label: "D", kind: "matrix" },
    { key: "eigenpairs", label: "eigenpairs", kind: "eigenpairs" },
    { key: "reconstructionError", label: "recon. err", kind: "number" },
    { key: "orthogonalityError", label: "orthog. err", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/spectral-theorem.html",
  pageStoreKey: "engine-lab:linear-algebra-spectral-theorem",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0 || A.length !== A[0].length) {
      return { outputs: {}, error: "Matrix must be square." };
    }
    try {
      const sp = LinAlg.spectralDecomposition(A);
      const QDQt = Algorithms.matMul(
        Algorithms.matMul(sp.Q, sp.D),
        LinAlg.transpose(sp.Q),
      );
      const QtQ = Algorithms.matMul(LinAlg.transpose(sp.Q), sp.Q);
      let rec = 0;
      let orth = 0;
      for (let i = 0; i < A.length; i++) {
        for (let j = 0; j < A.length; j++) {
          rec = Math.max(rec, Math.abs(QDQt[i][j] - A[i][j]));
          orth = Math.max(orth, Math.abs(QtQ[i][j] - (i === j ? 1 : 0)));
        }
      }
      return {
        outputs: {
          Q: sp.Q,
          D: sp.D,
          eigenpairs: sp.eigenspaces.map((e) => ({
            eigenvalue: e.eigenvalue,
            vectors: e.vectors,
          })),
          reconstructionError: rec,
          orthogonalityError: orth,
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
