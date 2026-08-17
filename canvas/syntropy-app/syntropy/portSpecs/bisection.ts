import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const BISECTION_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "bisection",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "x^3 - x - 2" },
    { key: "a", label: "a", kind: "number", default: 1 },
    { key: "b", label: "b", kind: "number", default: 2 },
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
  pagePath: "/math-lab/engines/numerical/methods/bisection.html",
  pageStoreKey: "engine-lab:numerical-bisection",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const iterations = Algorithms.runBisection(
        compiled.fn,
        a,
        b,
        tol,
        maxIter,
      );
      const last = iterations[iterations.length - 1];
      return {
        outputs: {
          iterationTrace: iterations,
          root: last.c,
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
