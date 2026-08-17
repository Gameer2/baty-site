import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const RICHARDSON_DIFF_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "richardson-diff",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "sin(x)" },
    { key: "x", label: "x", kind: "number", default: 0.7853981633974483 },
    { key: "h", label: "h", kind: "number", default: 0.1 },
  ],
  outputs: [
    { key: "richardson", label: "richardson", kind: "number" },
    { key: "D1", label: "D(h)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/richardson-diff.html",
  pageStoreKey: "engine-lab:numerical-richardson-diff",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const x = Number(inputs.x);
    const h = Number(inputs.h);

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runRichardsonDiff(compiled.fn, x, h);
      return {
        outputs: {
          richardson: result.richardson,
          D1: result.D1,
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
