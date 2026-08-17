import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls math-lab's CAS.uSubstitution(integrand, variable) and surfaces
// the verified antiderivative as a Symbolic expression. The page (methods/u-substitution.html)
// auto-detects u = g(x); the op takes only the integrand + variable. See the calculus plan Task 2.
export const U_SUBSTITUTION_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "u-substitution",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x*sin(x^2)" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
  ],
  outputs: [
    { key: "antiderivative", label: "∫f dx", kind: "expression" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/u-substitution.html",
  pageStoreKey: "engine-lab:calculus-u-substitution",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const r = await runCas("uSubstitution", [f, variable]);
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
