import { runCas } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.improperIntegral(f, variable, a, b) and surfaces the exact
// integral value as a Symbolic expression plus its numeric value and the converge/diverge verdict.
// Convergence/divergence is an answer, not an error (as in the limits spec): a divergent integral
// shows "Diverges" in the expression output. See calculus plan Task 10.
export const IMPROPER_INTEGRALS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "improper-integrals",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "1/x^2" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
    { key: "a", label: "from", kind: "expression", default: "1" },
    { key: "b", label: "to", kind: "expression", default: "Infinity" },
  ],
  outputs: [
    { key: "integral", label: "∫f dx", kind: "expression" },
    { key: "value", label: "value", kind: "number" },
    { key: "verdict", label: "verdict", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/improper-integrals.html",
  pageStoreKey: "engine-lab:calculus-improper-integrals",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const a = String(inputs.a ?? "0");
    const b = String(inputs.b ?? "Infinity");
    const r = await runCas("improperIntegral", [f, variable, a, b]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const verdict = String(r.result.verdict ?? "");
    const integral: ExpressionOutput = {
      display:
        verdict === "converges" ? String(r.result.value ?? "") : "Diverges",
      structured: { kind: "plain" },
    };
    const numeric = Number(r.result.numeric);
    return {
      outputs: {
        integral,
        value: Number.isFinite(numeric) ? numeric : undefined,
        verdict,
      },
    };
  },
};
