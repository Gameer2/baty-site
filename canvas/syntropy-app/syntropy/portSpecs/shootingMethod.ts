import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const SHOOTING_METHOD_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "shooting-method",
  inputs: [
    { key: "px", label: "p(x)", kind: "expression", default: "0" },
    { key: "qx", label: "q(x)", kind: "expression", default: "-1" },
    { key: "rx", label: "r(x)", kind: "expression", default: "0" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 1.5707963267948966 },
    { key: "alpha", label: "y(a)", kind: "number", default: 0 },
    { key: "beta", label: "y(b)", kind: "number", default: 1 },
    { key: "n", label: "steps", kind: "number", default: 200 },
  ],
  outputs: [
    { key: "yMid", label: "y(mid)", kind: "number" },
    { key: "c", label: "c", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/shooting-method.html",
  pageStoreKey: "engine-lab:numerical-shooting-method",
  compute: (inputs): ComputeResult => {
    const cp = compileExpression(String(inputs.px ?? ""));
    if (!cp.ok) {
      return { outputs: {}, error: `Invalid p(x): ${cp.error}` };
    }
    const cq = compileExpression(String(inputs.qx ?? ""));
    if (!cq.ok) {
      return { outputs: {}, error: `Invalid q(x): ${cq.error}` };
    }
    const cr = compileExpression(String(inputs.rx ?? ""));
    if (!cr.ok) {
      return { outputs: {}, error: `Invalid r(x): ${cr.error}` };
    }

    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const alpha = Number(inputs.alpha);
    const beta = Number(inputs.beta);
    const n = Math.round(Number(inputs.n));

    if (a === b) {
      return { outputs: {}, error: "a and b must be distinct endpoints." };
    }
    try {
      const result = Algorithms.runShooting(
        cp.fn,
        cq.fn,
        cr.fn,
        a,
        b,
        alpha,
        beta,
        n,
      );
      const mid = (a + b) / 2;
      const closest = result.path.reduce((best, p) =>
        Math.abs(p.x - mid) < Math.abs(best.x - mid) ? p : best,
      );
      return { outputs: { yMid: closest.y, c: result.c } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
