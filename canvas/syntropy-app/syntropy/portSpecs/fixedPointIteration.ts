import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const FIXED_POINT_ITERATION_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "fixed-point-iteration",
  inputs: [
    { key: "gx", label: "g(x)", kind: "expression", default: "cos(x)" },
    { key: "x0", label: "x0", kind: "number", default: 0.5 },
    { key: "tol", label: "tol", kind: "number", default: 0.000001 },
    { key: "maxIter", label: "max iter", kind: "number", default: 40 },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "root", label: "root", kind: "number" },
    { key: "iterations", label: "iterations", kind: "number" },
    { key: "error", label: "error", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/fixed-point-iteration.html",
  pageStoreKey: "engine-lab:numerical-fixed-point-iteration",
  compute: (inputs): ComputeResult => {
    const gx = String(inputs.gx ?? "");
    const x0 = Number(inputs.x0);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));

    const compiled = compileExpression(gx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const iterations = Algorithms.runFixedPoint(
        compiled.fn,
        x0,
        tol,
        maxIter,
      );
      const last = iterations[iterations.length - 1];
      return {
        outputs: {
          iterationTrace: iterations,
          root: last.gx,
          iterations: iterations.length,
          error: last.err,
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
