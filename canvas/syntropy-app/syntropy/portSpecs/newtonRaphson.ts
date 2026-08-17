import {
  compileExpression,
  differentiateExpression,
} from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const NEWTON_RAPHSON_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "newton-raphson",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "x^3 - x - 2" },
    { key: "x0", label: "x0", kind: "number", default: 1.5 },
    { key: "tol", label: "tol", kind: "number", default: 0.000001 },
    { key: "maxIter", label: "max iter", kind: "number", default: 30 },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "root", label: "root", kind: "number" },
    { key: "iterations", label: "iterations", kind: "number" },
    { key: "error", label: "error", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/newton-raphson.html",
  pageStoreKey: "engine-lab:numerical-newton-raphson",
  // f'(x) is auto-derived, not typed by hand — mirrors newton-raphson.js's own
  // `Engine.derivativeFx(compiled.node)` call.
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const x0 = Number(inputs.x0);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    const derivative = differentiateExpression(fx);
    if (!derivative.ok) {
      return { outputs: {}, error: derivative.error };
    }
    try {
      const iterations = Algorithms.runNewton(
        compiled.fn,
        derivative.fn,
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
