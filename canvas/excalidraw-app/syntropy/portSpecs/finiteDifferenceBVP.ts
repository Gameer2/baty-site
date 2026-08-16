import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const FINITE_DIFFERENCE_BVP_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "finite-difference-bvp",
  inputs: [
    { key: "p", label: "p(x)", kind: "expression", default: "0" },
    { key: "q", label: "q(x)", kind: "expression", default: "-1" },
    { key: "r", label: "r(x)", kind: "expression", default: "0" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 1.5707963267948966 },
    { key: "alpha", label: "y(a)", kind: "number", default: 0 },
    { key: "beta", label: "y(b)", kind: "number", default: 1 },
    { key: "n", label: "subintervals", kind: "number", default: 10 },
  ],
  outputs: [{ key: "yMid", label: "y(mid)", kind: "number" }],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/finite-difference-bvp.html",
  pageStoreKey: "engine-lab:numerical-finite-difference-bvp",
  compute: (inputs): ComputeResult => {
    const cp = compileExpression(String(inputs.p ?? ""));
    if (!cp.ok) {
      return { outputs: {}, error: `Invalid p(x): ${cp.error}` };
    }
    const cq = compileExpression(String(inputs.q ?? ""));
    if (!cq.ok) {
      return { outputs: {}, error: `Invalid q(x): ${cq.error}` };
    }
    const cr = compileExpression(String(inputs.r ?? ""));
    if (!cr.ok) {
      return { outputs: {}, error: `Invalid r(x): ${cr.error}` };
    }

    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const alpha = Number(inputs.alpha);
    const beta = Number(inputs.beta);
    const n = Math.round(Number(inputs.n));

    if (a === b) {
      return { outputs: {}, error: "Interval endpoints a and b must differ." };
    }
    try {
      const result = Algorithms.runFiniteDifference(
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
      const closest = result.grid.reduce((best, g) =>
        Math.abs(g.x - mid) < Math.abs(best.x - mid) ? g : best,
      );
      return { outputs: { yMid: closest.w } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
