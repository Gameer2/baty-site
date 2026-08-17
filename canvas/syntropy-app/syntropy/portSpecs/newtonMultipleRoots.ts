import {
  compileExpression,
  differentiateExpression,
} from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const NEWTON_MULTIPLE_ROOTS_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "newton-multiple-roots",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "(x - 2)^2" },
    { key: "x0", label: "x0", kind: "number", default: 0 },
    { key: "tol", label: "tol", kind: "number", default: 0.000001 },
    { key: "maxIter", label: "max iter", kind: "number", default: 20 },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "root", label: "root", kind: "number" },
    { key: "iterations", label: "iterations", kind: "number" },
    { key: "error", label: "error", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/newton-multiple-roots.html",
  pageStoreKey: "engine-lab:numerical-newton-multiple-roots",
  // f'(x) and f''(x) are auto-derived, not typed by hand — mirrors
  // newton-multiple-roots.js's `Engine.derivativeFx(compiled.node)` chained twice.
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const x0 = Number(inputs.x0);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    const fp = differentiateExpression(fx, "x", 1);
    if (!fp.ok) {
      return { outputs: {}, error: fp.error };
    }
    const fpp = differentiateExpression(fx, "x", 2);
    if (!fpp.ok) {
      return { outputs: {}, error: fpp.error };
    }
    try {
      const iterations = Algorithms.runNewtonMultiple(
        compiled.fn,
        fp.fn,
        fpp.fn,
        x0,
        tol,
        maxIter,
      );
      const last = iterations[iterations.length - 1];
      return {
        outputs: {
          iterationTrace: iterations,
          root: last.xNext,
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
