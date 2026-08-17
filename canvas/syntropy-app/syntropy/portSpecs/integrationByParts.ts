import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.integrationByParts(integrand, variable) and surfaces the
// verified antiderivative (u chosen by LIATE) as a Symbolic expression. See calculus plan Task 3.
export const INTEGRATION_BY_PARTS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "integration-by-parts",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x*e^x" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
  ],
  outputs: [
    { key: "antiderivative", label: "∫f dx", kind: "expression" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/integration-by-parts.html",
  pageStoreKey: "engine-lab:calculus-integration-by-parts",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const r = await runCas("integrationByParts", [f, variable]);
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
