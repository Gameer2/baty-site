import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.appliedOptimization(expr, variable, a, b, goal) and
// surfaces the optimal f-value (numeric) plus the location it occurs at. The op evaluates f on
// [a, b], finds the critical-point + endpoint extrema per the goal ("max" or "min"), and
// verifies the candidate against the derivative before returning. Inputs mirror the page
// (applied-optimization.js); a and b are numeric bounds. See the calculus plan Task 22.
export const APPLIED_OPTIMIZATION_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "applied-optimization",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x*(20-2*x)^2" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 10 },
    { key: "goal", label: "goal", kind: "expression", default: "max" },
  ],
  outputs: [
    { key: "optimal", label: "optimal f", kind: "number" },
    { key: "point", label: "at x", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/applied-optimization.html",
  pageStoreKey: "engine-lab:calculus-applied-optimization",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const a = Number(inputs.a ?? 0);
    const b = Number(inputs.b ?? 0);
    const goal = String(inputs.goal ?? "max");
    const r = await runCas("appliedOptimization", [f, variable, a, b, goal]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    return {
      outputs: {
        optimal: Number(r.result.value),
        point: String(r.result.x),
      },
    };
  },
};
