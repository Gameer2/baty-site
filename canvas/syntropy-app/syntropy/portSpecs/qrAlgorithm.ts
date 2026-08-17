import { parseMatrix } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const QR_ALGORITHM_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "qr-algorithm",
  inputs: [
    { key: "matrix", label: "A (rows ;)", kind: "matrix", default: "2,1;1,2" },
    { key: "tol", label: "tol", kind: "number", default: 0.00000001 },
    { key: "maxIter", label: "max iter", kind: "number", default: 100 },
  ],
  outputs: [
    { key: "eigenvalues", label: "eigenvalues", kind: "matrix" },
    { key: "dominantEigenvalue", label: "dominant λ", kind: "number" },
    { key: "offNorm", label: "off-norm", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/qr-algorithm.html",
  pageStoreKey: "engine-lab:numerical-qr-algorithm",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.matrix);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));

    if (A.length < 2 || !A.every((row) => row.length === A.length)) {
      return { outputs: {}, error: "Matrix must be square, at least 2x2." };
    }
    try {
      const iterations = Algorithms.runQRAlgorithm(A, tol, maxIter);
      const last = iterations[iterations.length - 1];
      const dominantEigenvalue = last.diag.reduce(
        (best, v) => (Math.abs(v) > Math.abs(best) ? v : best),
        last.diag[0],
      );
      return {
        outputs: {
          eigenvalues: last.diag.map((d) => [d]),
          dominantEigenvalue,
          offNorm: last.offNorm,
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
