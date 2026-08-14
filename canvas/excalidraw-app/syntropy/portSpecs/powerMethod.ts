import { parseMatrix, parseNumberList } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const POWER_METHOD_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "power-method",
  inputs: [
    { key: "matrix", label: "A (rows ;)", kind: "matrix", default: "2,1;1,2" },
    { key: "x0", label: "x0", kind: "vector", default: "1,0" },
    { key: "tol", label: "tol", kind: "number", default: 0.0000000001 },
    { key: "maxIter", label: "max iter", kind: "number", default: 100 },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "eigenvalue", label: "eigenvalue", kind: "number" },
    { key: "iterations", label: "iterations", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/power-method.html",
  pageStoreKey: "engine-lab:numerical-power-method",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.matrix);
    const x0 = parseNumberList(inputs.x0);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));

    if (A.length < 2 || !A.every((row) => row.length === A.length)) {
      return { outputs: {}, error: "Matrix must be square, at least 2x2." };
    }
    if (x0.length !== A.length) {
      return {
        outputs: {},
        error: "Starting vector length must match matrix size.",
      };
    }
    try {
      const iterations = Algorithms.runPowerMethod(A, x0, tol, maxIter);
      const last = iterations[iterations.length - 1];
      return {
        outputs: {
          iterationTrace: iterations,
          eigenvalue: last.mu,
          iterations: iterations.length,
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
