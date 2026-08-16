import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const NUMERICAL_DIFF_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "numerical-diff",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "sin(x)" },
    { key: "x", label: "x", kind: "number", default: 0.7853981633974483 },
    { key: "h", label: "h", kind: "number", default: 0.001 },
  ],
  outputs: [
    { key: "forward", label: "forward", kind: "number" },
    { key: "central", label: "central", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/numerical-diff.html",
  pageStoreKey: "engine-lab:numerical-numerical-diff",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const x = Number(inputs.x);
    const h = Number(inputs.h);

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runNumericalDiff(compiled.fn, x, h);
      return {
        outputs: {
          forward: result.forward,
          central: result.central,
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
