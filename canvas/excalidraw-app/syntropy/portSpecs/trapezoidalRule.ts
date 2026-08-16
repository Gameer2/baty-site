import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const TRAPEZOIDAL_RULE_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "trapezoidal-rule",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "e^x" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 1 },
    { key: "n", label: "n", kind: "number", default: 10 },
  ],
  outputs: [
    { key: "total", label: "total", kind: "number" },
    { key: "h", label: "h", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/trapezoidal-rule.html",
  pageStoreKey: "engine-lab:numerical-trapezoidal-rule",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const n = Math.round(Number(inputs.n));

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runTrapezoidal(compiled.fn, a, b, n);
      return {
        outputs: {
          total: result.total,
          h: result.h,
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
