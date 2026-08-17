import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.trigSubstitution(integrand, variable) and surfaces the
// verified antiderivative (after the x = a sin/cos/tan θ substitution) as a Symbolic expression.
// See calculus plan Task 5.
export const TRIG_SUBSTITUTION_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "trigonometric-substitution",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "sqrt(4-x^2)" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
  ],
  outputs: [
    { key: "antiderivative", label: "∫f dx", kind: "expression" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath:
    "/math-lab/engines/calculus/methods/trigonometric-substitution.html",
  pageStoreKey: "engine-lab:calculus-trigonometric-substitution",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const r = await runCas("trigSubstitution", [f, variable]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const antiderivative: ExpressionOutput = {
      display: String(r.result.result ?? ""),
      structured: { kind: "plain" },
    };
    return {
      outputs: {
        antiderivative,
        steps: stepsToText(r.result.steps),
      },
    };
  },
};
