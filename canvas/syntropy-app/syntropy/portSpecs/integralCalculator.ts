import { runCas } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.autoIntegrate(expr, variable) and surfaces the
// antiderivative as a Symbolic expression. The bridge op is indefinite-only — it takes just the
// integrand + variable (no bounds), and returns the antiderivative (no numeric value) — so unlike
// the plan's sketch this spec declares no `value` number output; it surfaces only the field the op
// returns. (Definite-evaluation, when the page supports bounds, stays page-side for v1.) See
// calculus plan Task 9.
export const INTEGRAL_CALCULATOR_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "integral-calculator",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "1/(x^3-2)" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
  ],
  outputs: [{ key: "antiderivative", label: "∫f dx", kind: "expression" }],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/integral-calculator.html",
  pageStoreKey: "engine-lab:calculus-integral-calculator",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const r = await runCas("autoIntegrate", [f, variable]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const antiderivative: ExpressionOutput = {
      display: String(r.result.result ?? ""),
      structured: { kind: "plain" },
    };
    return { outputs: { antiderivative } };
  },
};
