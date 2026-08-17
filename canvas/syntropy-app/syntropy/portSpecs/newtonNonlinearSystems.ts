import { compileVectorExpression } from "../compileExpression";

import { parseExpressionList, parseNumberList } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "newton-nonlinear-systems",
  inputs: [
    {
      key: "system",
      label: "F (x1..xn; per eq.)",
      kind: "expressions",
      default: "x1^2 + x2^2 - 2;x1 - x2",
    },
    { key: "x0", label: "x0", kind: "vector", default: "1.5,1.5" },
    { key: "tol", label: "tol", kind: "number", default: 0.0000000001 },
    { key: "maxIter", label: "max iter", kind: "number", default: 50 },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "x1", label: "x1", kind: "number" },
    { key: "error", label: "error", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/newton-nonlinear-systems.html",
  pageStoreKey: "engine-lab:numerical-newton-nonlinear-systems",
  compute: (inputs): ComputeResult => {
    const equations = parseExpressionList(inputs.system);
    const x0 = parseNumberList(inputs.x0);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));
    const n = equations.length;

    if (n < 2 || n > 4) {
      return { outputs: {}, error: "n must be between 2 and 4 equations." };
    }
    if (x0.length !== n) {
      return {
        outputs: {},
        error: "Initial guess length must match the number of equations.",
      };
    }
    const compiled = equations.map((eq) => compileVectorExpression(eq, n));
    const failed = compiled.find((c) => !c.ok);
    if (failed && !failed.ok) {
      return { outputs: {}, error: failed.error };
    }
    const F = compiled.map(
      (c) => (c as { ok: true; fn: (xVec: number[]) => number }).fn,
    );
    try {
      const iterations = Algorithms.runNewtonSystem(F, x0, tol, maxIter);
      const last = iterations[iterations.length - 1];
      return {
        outputs: {
          iterationTrace: iterations,
          x1: last.xNext[0],
          error: last.err,
          solution: last.xNext,
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
