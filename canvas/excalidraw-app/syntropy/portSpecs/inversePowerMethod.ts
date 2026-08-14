import { parseMatrix, parseNumberList } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const INVERSE_POWER_METHOD_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "inverse-power-method",
  inputs: [
    {
      key: "matrix",
      label: "A (rows ;)",
      kind: "matrix",
      default: "3.5,1.5;1.5,3.5",
    },
    { key: "x0", label: "x0", kind: "vector", default: "1,0" },
    { key: "tol", label: "tol", kind: "number", default: 0.000001 },
    { key: "maxIter", label: "max iter", kind: "number", default: 100 },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "eigenvalue", label: "min |eigenvalue|", kind: "number" },
    { key: "iterations", label: "iterations", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/inverse-power-method.html",
  pageStoreKey: "engine-lab:numerical-inverse-power-method",
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
      const iterations = Algorithms.runInversePowerMethod(A, x0, tol, maxIter);
      const last = iterations[iterations.length - 1];
      return {
        outputs: {
          iterationTrace: iterations,
          eigenvalue: last.lambdaMin,
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
