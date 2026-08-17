import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const SIMPSONS_RULE_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "simpsons-rule",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "sin(x)" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 3.14159265358979 },
    { key: "n", label: "n", kind: "number", default: 6 },
  ],
  outputs: [
    { key: "total", label: "total", kind: "number" },
    { key: "h", label: "h", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/simpsons-rule.html",
  pageStoreKey: "engine-lab:numerical-simpsons-rule",
  // mode is always "auto" here — the page's 1/3-only and 3/8-only radio options aren't
  // exposed as a node input this phase; PortInputKind has no "select" kind yet.
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
      const result = Algorithms.runSimpson(compiled.fn, a, b, n, "auto");
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
