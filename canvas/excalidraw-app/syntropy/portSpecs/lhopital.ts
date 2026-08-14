import { limitDisplay, runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.lhopital(expr, variable, at) and surfaces the limit as a
// Symbolic expression, with the L'Hôpital reduction chain as steps. ∞ / DNE are answers, not
// errors (limitDisplay, as in the limits spec). See calculus plan Task 8.
export const LHOPITAL_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "lhopital",
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
  pagePath: "/math-lab/engines/calculus/methods/lhopital.html",
  pageStoreKey: "engine-lab:calculus-lhopital",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const at = String(inputs.at ?? "0");
    const r = await runCas("lhopital", [f, variable, at]);
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
