import { limitDisplay, runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.limit(expr, variable, at) and surfaces the limit as a
// Symbolic expression. The page treats ∞ and DNE as legitimate answers (not errors), so the
// expression output's display mirrors that: finite → the exact value, infinite → ∞ / -∞,
// dne → "Does not exist" (limitDisplay). See calculus plan Task 7.
export const LIMITS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "limits",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "sin(x)/x" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
    { key: "at", label: "approaches", kind: "expression", default: "0" },
  ],
  outputs: [
    { key: "limit", label: "lim", kind: "expression" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/limits.html",
  pageStoreKey: "engine-lab:calculus-limits",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const at = String(inputs.at ?? "0");
    const r = await runCas("limit", [f, variable, at]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const limit: ExpressionOutput = {
      display: limitDisplay(r.result as { kind?: string; value?: unknown }),
      structured: { kind: "plain" },
    };
    return {
      outputs: {
        limit,
        steps: stepsToText(r.result.steps),
      },
    };
  },
};
