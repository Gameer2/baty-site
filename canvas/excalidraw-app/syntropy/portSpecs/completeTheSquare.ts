import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.completeTheSquare(integrand, variable) and surfaces the
// completed-square form (e.g. (x+1)² + 4) as a Symbolic expression — the headline is the rewrite,
// not the antiderivative it enables. See calculus plan Task 6.
export const COMPLETE_THE_SQUARE_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "completing-the-square",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "1/(x^2+2*x+5)" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
  ],
  outputs: [
    { key: "completedForm", label: "completed form", kind: "expression" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/completing-the-square.html",
  pageStoreKey: "engine-lab:calculus-completing-the-square",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const r = await runCas("completeTheSquare", [f, variable]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const completedForm: ExpressionOutput = {
      display: String(r.result.completedSquare ?? ""),
      structured: { kind: "plain" },
    };
    return {
      outputs: {
        completedForm,
        steps: stepsToText(r.result.steps),
      },
    };
  },
};
