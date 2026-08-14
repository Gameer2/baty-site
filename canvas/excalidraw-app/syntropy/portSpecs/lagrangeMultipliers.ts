import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.lagrangeMultipliers(f, g, c, ["x","y"], {}) —
// constrained optimization of f(x,y) subject to g(x,y) = c. The op solves ∇f = λ∇g numerically
// (nerdamer's system solver is silently incomplete/inexact, so it's never trusted here) and
// returns BOTH the max and min critical points. v1 surfaces a single headline extremum as the
// Scalar `optimal` number + its "(x, y)" location as text: the max when one exists, falling back
// to the min; the page (lagrange-multipliers.js) renders the full max/min pair + 3D viz. See the
// calculus plan Task 23.
export const LAGRANGE_MULTIPLIERS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "lagrange-multipliers",
  inputs: [
    { key: "f", label: "f(x, y)", kind: "expression", default: "x*y" },
    { key: "g", label: "constraint g", kind: "expression", default: "x^2+y^2" },
    { key: "c", label: "g = c", kind: "expression", default: "1" },
  ],
  outputs: [
    { key: "optimal", label: "extremal f", kind: "number" },
    { key: "point", label: "at (x, y)", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/lagrange-multipliers.html",
  pageStoreKey: "engine-lab:calculus-lagrange-multipliers",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const g = String(inputs.g ?? "");
    const c = String(inputs.c ?? "");
    const r = await runCas("lagrangeMultipliers", [f, g, c, ["x", "y"], {}]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const best = (r.result.max ?? r.result.min) as
      | { x: number; y: number; value: number }
      | null
      | undefined;
    if (!best) {
      return {
        outputs: {},
        error: "No critical point found on the constraint.",
      };
    }
    return {
      outputs: {
        optimal: Number(best.value),
        point: `(${best.x}, ${best.y})`,
      },
    };
  },
};
