import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";
import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const GRAM_SCHMIDT_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "gram-schmidt",
  inputs: [
    {
      key: "A",
      label: "vectors (cols ;)",
      kind: "matrix",
      default: "1,1,0;1,0,1;0,1,1",
    },
  ],
  outputs: [
    { key: "Q", label: "Q", kind: "matrix" },
    { key: "R", label: "R", kind: "matrix" },
    { key: "orthogonalityError", label: "orthog. err", kind: "number" },
    { key: "reconstructionError", label: "recon. err", kind: "number" },
  ],
  relation: "factorization",
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/gram-schmidt.html",
  pageStoreKey: "engine-lab:linear-algebra-gram-schmidt",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.A);
    if (A.length === 0) {
      return { outputs: {}, error: "Matrix must have at least one row." };
    }
    try {
      const { Q, R } = LinAlg.qrDecompose(A);
      const QtQ = Algorithms.matMul(LinAlg.transpose(Q), Q);
      let orth = 0;
      for (let i = 0; i < QtQ.length; i++) {
        for (let j = 0; j < QtQ[i].length; j++) {
          orth = Math.max(orth, Math.abs(QtQ[i][j] - (i === j ? 1 : 0)));
        }
      }
      const QR = Algorithms.matMul(Q, R);
      let recon = 0;
      for (let i = 0; i < A.length; i++) {
        for (let j = 0; j < A[i].length; j++) {
          recon = Math.max(recon, Math.abs(QR[i][j] - A[i][j]));
        }
      }
      return {
        outputs: {
          Q,
          R,
          orthogonalityError: orth,
          reconstructionError: recon,
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
