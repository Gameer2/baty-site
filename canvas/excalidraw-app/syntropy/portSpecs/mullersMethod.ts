import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const MULLERS_METHOD_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "mullers-method",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "x^3 - x - 2" },
    { key: "x0", label: "x0", kind: "number", default: 1 },
    { key: "x1", label: "x1", kind: "number", default: 1.5 },
    { key: "x2", label: "x2", kind: "number", default: 2 },
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
  pagePath: "/math-lab/engines/numerical/methods/mullers-method.html",
  pageStoreKey: "engine-lab:numerical-mullers-method",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const x0 = Number(inputs.x0);
    const x1 = Number(inputs.x1);
    const x2 = Number(inputs.x2);
    const tol = Number(inputs.tol);
    const maxIter = Math.round(Number(inputs.maxIter));

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const iterations = Algorithms.runMuller(
        compiled.fn,
        x0,
        x1,
        x2,
        tol,
        maxIter,
      );
      const last = iterations[iterations.length - 1];
      return {
        outputs: {
          iterationTrace: iterations,
          root: last.x3,
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
